import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  describeFsError,
  isWindowsUnknownOpenError,
  MAC_FULL_DISK_ACCESS_HINT,
  mapFsError,
  noPermissionMessage,
  rethrowPreQuarantineError,
  WINDOWS_UNKNOWN_OPEN_MESSAGE,
} from './fs-errors';

// ── M7 이전 구현 (macOS 동작 기준). 수정하지 말 것 ──────────────────────────
// scans.service.ts의 describeFsError
function legacyDescribeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return '파일이 사라짐';
  if (code === 'EACCES' || code === 'EPERM') return '읽기 권한 없음';
  return (err as Error).message;
}
// quarantine.service.ts의 mapFsError
function legacyMapFsError(err: unknown, fallback: string): Error {
  if (err instanceof HttpException) return err;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EBUSY') {
    return new ConflictException({
      code: 'FILE_BUSY',
      message: '다른 프로그램이 파일을 사용 중입니다',
    });
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new ForbiddenException({
      code: 'NO_PERMISSION',
      message: `${fallback} (권한 없음)`,
    });
  }
  return new Error(`${fallback}: ${(err as Error).message}`);
}
const LEGACY_NO_PERMISSION =
  '읽기 권한이 없습니다 (VS Code 전체 디스크 접근 권한 확인)';
// ────────────────────────────────────────────────────────────────────────

// 가짜 fs 오류 — 실제 파일은 건드리지 않는다
const fsErr = (code: string, errno: number, message = `${code}: test`) =>
  Object.assign(new Error(message), { code, errno });

const SAMPLES: [string, unknown][] = [
  ['ENOENT', fsErr('ENOENT', -2)],
  ['EACCES', fsErr('EACCES', -13)],
  ['EPERM', fsErr('EPERM', -1)],
  ['EBUSY', fsErr('EBUSY', -16)],
  ['EISDIR', fsErr('EISDIR', -21)],
  ['UNKNOWN(-4094)', fsErr('UNKNOWN', -4094, 'UNKNOWN: unknown error, open')],
  ['코드 없는 오류', new Error('boom')],
  ['HttpException', new NotFoundException({ code: 'NOT_FOUND' })],
];

// 응답으로 나가는 형태(상태 코드·본문·메시지)로 비교
const shape = (e: Error) => ({
  type: e.constructor.name,
  message: e.message,
  status: e instanceof HttpException ? e.getStatus() : undefined,
  body: e instanceof HttpException ? e.getResponse() : undefined,
});

// 사용자 결정(2026-11-10): macOS 권한 오류(EACCES·EPERM)만 M7 이전 메시지 뒤에
// 전체 디스크 접근 권한 안내가 붙는다. 상태 코드·code와 그 밖의 오류는 이전과 같다.
const PERMISSION = new Set(['EACCES', 'EPERM']);
const macHinted = (platform: NodeJS.Platform, name: string) =>
  platform === 'darwin' && PERMISSION.has(name);
const withHint = (message: string) =>
  `${message}. ${MAC_FULL_DISK_ACCESS_HINT}`;

/** 검사 결과 메시지 기대값 */
const expectedDescribe = (
  platform: NodeJS.Platform,
  name: string,
  err: unknown,
) =>
  macHinted(platform, name)
    ? withHint(legacyDescribeFsError(err))
    : legacyDescribeFsError(err);

/** mapFsError 응답 기대값 (안내가 붙는 경우 상태 코드·본문으로 비교) */
const expectMapped = (
  actual: Error,
  platform: NodeJS.Platform,
  name: string,
  err: unknown,
  fallback: string,
) => {
  const legacy = legacyMapFsError(err, fallback);
  if (!macHinted(platform, name)) {
    expect(shape(actual)).toEqual(shape(legacy));
    return;
  }
  const body = (legacy as HttpException).getResponse() as {
    message: string;
  };
  expect(actual).toBeInstanceOf(ForbiddenException);
  expect((actual as HttpException).getStatus()).toBe(
    (legacy as HttpException).getStatus(),
  );
  expect((actual as HttpException).getResponse()).toEqual({
    ...body,
    message: withHint(body.message),
  });
};

describe.each(['darwin', 'linux'] as const)(
  '%s: M7 이전과 결과가 같다 (맥 권한 오류는 안내만 추가)',
  (platform) => {
    it.each(SAMPLES)('describeFsError — %s', (name, err) => {
      expect(describeFsError(err, platform)).toBe(
        expectedDescribe(platform, name, err),
      );
    });

    it.each(SAMPLES)('mapFsError — %s', (name, err) => {
      expectMapped(
        mapFsError(err, '복원에 실패했습니다', platform),
        platform,
        name,
        err,
        '복원에 실패했습니다',
      );
    });

    // 격리 전 단계: 권한·사용 중 오류는 mapFsError(M7 이전 구현)와 같은 응답으로 바꾸고
    // (이전에는 그대로 던져 500), 나머지는 이전처럼 그대로 던진다.
    const MAPPED_BEFORE_QUARANTINE = new Set(['EACCES', 'EPERM', 'EBUSY']);

    it.each(SAMPLES)('격리 전 단계 오류 — %s', (name, err) => {
      const rethrow = rethrowPreQuarantineError('격리 실패', platform);
      let thrown: unknown;
      try {
        rethrow(err);
      } catch (e) {
        thrown = e;
      }
      if (MAPPED_BEFORE_QUARANTINE.has(name)) {
        expect(thrown).toBeInstanceOf(HttpException);
        expectMapped(thrown as Error, platform, name, err, '격리 실패');
      } else {
        expect(thrown).toBe(err);
      }
    });

    it('격리 전 단계 권한 오류는 500 대신 403 NO_PERMISSION', () => {
      const rethrow = rethrowPreQuarantineError(
        '파일을 열 수 없어 격리하지 못했습니다',
        platform,
      );
      expect(() => rethrow(fsErr('EACCES', -13))).toThrow(ForbiddenException);
      try {
        rethrow(fsErr('EACCES', -13));
      } catch (e) {
        expect((e as ForbiddenException).getStatus()).toBe(403);
        expect((e as ForbiddenException).getResponse()).toEqual({
          code: 'NO_PERMISSION',
          message:
            platform === 'darwin'
              ? '파일을 열 수 없어 격리하지 못했습니다 (권한 없음). 전체 디스크 접근 권한이 꺼져 있으면 이 오류가 날 수 있어요. 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 실행 중인 앱을 켜 보세요'
              : '파일을 열 수 없어 격리하지 못했습니다 (권한 없음)',
        });
      }
    });

    it('권한 오류 안내 문구', () => {
      expect(noPermissionMessage(platform)).toBe(LEGACY_NO_PERMISSION);
    });

    it('UNKNOWN 오류를 Windows 오류로 보지 않는다', () => {
      expect(isWindowsUnknownOpenError(fsErr('UNKNOWN', -4094), platform)).toBe(
        false,
      );
    });
  },
);

describe('win32', () => {
  const unknown = fsErr('UNKNOWN', -4094, 'UNKNOWN: unknown error, open');

  it('원인 불명 열기 실패는 단정하지 않는 문구로 표시한다', () => {
    expect(describeFsError(unknown, 'win32')).toBe(
      WINDOWS_UNKNOWN_OPEN_MESSAGE,
    );
    expect(WINDOWS_UNKNOWN_OPEN_MESSAGE).toContain('수 있음');
  });

  it('code나 errno 중 하나만 맞아도 인식한다', () => {
    expect(isWindowsUnknownOpenError(fsErr('UNKNOWN', 0), 'win32')).toBe(true);
    expect(isWindowsUnknownOpenError(fsErr('X', -4094), 'win32')).toBe(true);
    expect(isWindowsUnknownOpenError(fsErr('EBUSY', -4082), 'win32')).toBe(
      false,
    );
  });

  it('격리 전 단계의 원인 불명 오류는 500 대신 409 FILE_UNREADABLE', () => {
    const rethrow = rethrowPreQuarantineError(
      '파일을 열 수 없어 격리하지 못했습니다',
      'win32',
    );
    try {
      rethrow(unknown);
      throw new Error('던져야 함');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toEqual({
        code: 'FILE_UNREADABLE',
        message:
          '파일을 열 수 없어 격리하지 못했습니다 (Windows 보안 등의 이유일 수 있음)',
      });
    }
  });

  it('mapFsError도 원인 불명 오류를 409로 바꾼다', () => {
    const e = mapFsError(unknown, '복원에 실패했습니다', 'win32');
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as ConflictException).getResponse()).toMatchObject({
      code: 'FILE_UNREADABLE',
    });
  });

  it('그 밖의 오류는 macOS와 같게 처리한다', () => {
    for (const [, err] of SAMPLES.filter(([n]) => !n.startsWith('UNKNOWN'))) {
      expect(describeFsError(err, 'win32')).toBe(legacyDescribeFsError(err));
      expect(shape(mapFsError(err, 'x', 'win32'))).toEqual(
        shape(legacyMapFsError(err, 'x')),
      );
    }
  });

  it('권한 오류 안내는 Windows 문구', () => {
    expect(noPermissionMessage('win32')).not.toContain('전체 디스크');
  });
});

describe('맥 권한 오류의 전체 디스크 접근 권한 안내', () => {
  it('맥: 검사 결과·격리·복원·삭제 메시지에 모두 붙는다', () => {
    expect(describeFsError(fsErr('EPERM', -1), 'darwin')).toBe(
      '읽기 권한 없음. 전체 디스크 접근 권한이 꺼져 있으면 이 오류가 날 수 있어요. 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 실행 중인 앱을 켜 보세요',
    );
    for (const fallback of [
      '원본 파일을 지울 수 없어 격리를 취소했습니다',
      '복원에 실패했습니다',
      '격리 파일을 삭제하지 못했습니다',
    ]) {
      const e = mapFsError(fsErr('EACCES', -13), fallback, 'darwin');
      expect((e as ForbiddenException).getResponse()).toEqual({
        code: 'NO_PERMISSION',
        message: withHint(`${fallback} (권한 없음)`),
      });
    }
  });

  it('원인을 단정하지 않는다', () => {
    expect(MAC_FULL_DISK_ACCESS_HINT).toContain('날 수 있어요');
  });

  it('맥: 권한 오류가 아니면 붙지 않는다', () => {
    expect(describeFsError(fsErr('ENOENT', -2), 'darwin')).toBe(
      '파일이 사라짐',
    );
    expect(
      (mapFsError(fsErr('EBUSY', -16), 'x', 'darwin') as HttpException).message,
    ).not.toContain('전체 디스크');
  });

  it.each(['win32', 'linux'] as const)('%s에는 붙지 않는다', (platform) => {
    for (const err of [fsErr('EPERM', -1), fsErr('EACCES', -13)]) {
      expect(describeFsError(err, platform)).toBe('읽기 권한 없음');
      expect(
        (mapFsError(err, '복원 실패', platform) as HttpException).getResponse(),
      ).toEqual({
        code: 'NO_PERMISSION',
        message: '복원 실패 (권한 없음)',
      });
      try {
        rethrowPreQuarantineError('격리 실패', platform)(err);
        throw new Error('던져야 함');
      } catch (e) {
        expect((e as ForbiddenException).getResponse()).toEqual({
          code: 'NO_PERMISSION',
          message: '격리 실패 (권한 없음)',
        });
      }
    }
  });
});
