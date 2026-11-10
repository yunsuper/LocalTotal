import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';

/**
 * 파일 시스템 오류를 사용자에게 보여 줄 형태로 바꾼다.
 * OS별 차이는 platform 인자로만 갈린다. macOS(darwin) 결과는 M7 이전과 같아야 한다(fs-errors.spec.ts).
 */

type Platform = NodeJS.Platform;

const errCode = (err: unknown) => (err as NodeJS.ErrnoException)?.code;

/** libuv가 원인을 분류하지 못한 오류 (UV_UNKNOWN) */
const UV_UNKNOWN = -4094;

/**
 * Windows에서 원인을 알 수 없는 열기 실패.
 * Defender 등 보안 프로그램이 차단한 파일(Win32 오류 225)이 이렇게 나오지만,
 * 다른 원인도 같은 값으로 나올 수 있으므로 단정하지 않는다.
 */
export function isWindowsUnknownOpenError(
  err: unknown,
  platform: Platform = process.platform,
): boolean {
  if (platform !== 'win32') return false;
  const e = err as NodeJS.ErrnoException;
  return e?.code === 'UNKNOWN' || e?.errno === UV_UNKNOWN;
}

/** 원인을 단정하지 않는다 (Defender 차단이 대표적이지만 다른 원인일 수도 있음) */
export const WINDOWS_UNKNOWN_OPEN_REASON = 'Windows 보안 등의 이유일 수 있음';
export const WINDOWS_UNKNOWN_OPEN_MESSAGE = `파일을 열 수 없음 (${WINDOWS_UNKNOWN_OPEN_REASON})`;

/** 검사 결과의 오류 메시지 */
export function describeFsError(
  err: unknown,
  platform: Platform = process.platform,
): string {
  const code = errCode(err);
  if (code === 'ENOENT') return '파일이 사라짐';
  if (code === 'EACCES' || code === 'EPERM') return '읽기 권한 없음';
  if (isWindowsUnknownOpenError(err, platform))
    return WINDOWS_UNKNOWN_OPEN_MESSAGE;
  return (err as Error).message;
}

/** 경로 확인 단계(resolveTarget)의 권한 오류 안내 */
export function noPermissionMessage(
  platform: Platform = process.platform,
): string {
  return platform === 'win32'
    ? '읽기 권한이 없습니다 (관리자 권한이 필요한 폴더이거나 다른 프로그램이 막고 있을 수 있음)'
    : '읽기 권한이 없습니다 (VS Code 전체 디스크 접근 권한 확인)';
}

/** 격리·복원·삭제 중 오류 → API 오류 */
export function mapFsError(
  err: unknown,
  fallback: string,
  platform: Platform = process.platform,
): Error {
  if (err instanceof HttpException) return err;
  const code = errCode(err);
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
  if (isWindowsUnknownOpenError(err, platform))
    return unreadableError(fallback);
  return new Error(`${fallback}: ${(err as Error).message}`);
}

/**
 * 격리 전 단계(해시 재확인·복사)에서 쓰는 처리.
 * 권한 오류(EACCES·EPERM) → 403 NO_PERMISSION, 사용 중(EBUSY) → 409 FILE_BUSY,
 * Windows 원인 불명 열기 실패 → 409 FILE_UNREADABLE (모두 mapFsError와 같은 응답).
 * 그 밖의 오류는 그대로 던진다. 이전에는 권한 오류도 그대로 던져 500이 됐다.
 */
export function rethrowPreQuarantineError(
  fallback: string,
  platform: Platform = process.platform,
): (err: unknown) => never {
  return (err) => {
    const code = errCode(err);
    if (
      code === 'EACCES' ||
      code === 'EPERM' ||
      code === 'EBUSY' ||
      isWindowsUnknownOpenError(err, platform)
    )
      throw mapFsError(err, fallback, platform);
    throw err;
  };
}

function unreadableError(fallback: string) {
  return new ConflictException({
    code: 'FILE_UNREADABLE',
    message: `${fallback} (${WINDOWS_UNKNOWN_OPEN_REASON})`,
  });
}
