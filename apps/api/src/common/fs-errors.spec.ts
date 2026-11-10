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

describe.each(['darwin', 'linux'] as const)(
  '%s: M7 이전과 결과가 같다',
  (platform) => {
    it.each(SAMPLES)('describeFsError — %s', (_, err) => {
      expect(describeFsError(err, platform)).toBe(legacyDescribeFsError(err));
    });

    it.each(SAMPLES)('mapFsError — %s', (_, err) => {
      expect(shape(mapFsError(err, '복원에 실패했습니다', platform))).toEqual(
        shape(legacyMapFsError(err, '복원에 실패했습니다')),
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
        const legacy = legacyMapFsError(err, '격리 실패') as HttpException;
        const macHint = platform === 'darwin' && name !== 'EBUSY';
        // 상태 코드·code는 mapFsError와 같고, 맥 권한 오류만 메시지 뒤에 안내가 붙는다
        expect((thrown as HttpException).getStatus()).toBe(legacy.getStatus());
        expect((thrown as HttpException).getResponse()).toEqual(
          macHint
            ? {
                ...(legacy.getResponse() as object),
                message: `격리 실패 (권한 없음). ${MAC_FULL_DISK_ACCESS_HINT}`,
              }
            : legacy.getResponse(),
        );
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
              ? '파일을 열 수 없어 격리하지 못했습니다 (권한 없음). 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 실행 중인 앱을 켜 주세요'
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

describe('격리 전 단계 권한 오류의 전체 디스크 접근 권한 안내', () => {
  it.each(['win32', 'linux'] as const)('%s에는 붙지 않는다', (platform) => {
    const rethrow = rethrowPreQuarantineError('격리 실패', platform);
    try {
      rethrow(fsErr('EPERM', -1));
      throw new Error('던져야 함');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toEqual({
        code: 'NO_PERMISSION',
        message: '격리 실패 (권한 없음)',
      });
    }
  });
});
