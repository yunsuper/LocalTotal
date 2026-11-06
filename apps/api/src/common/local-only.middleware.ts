import type { NextFunction, Request, Response } from 'express';

const ALLOWED_HOSTS = new Set(['127.0.0.1:4000', 'localhost:4000']);
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:3000']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function deny(res: Response, code: string, message: string) {
  res.status(403).json({ code, message });
}

/**
 * 로컬 UI에서 온 요청만 통과시킨다.
 * - Host 검사: DNS 리바인딩 차단
 * - Origin 검사: 다른 웹사이트에서 온 요청 차단
 * - 변경 요청에 X-LocalTotal 헤더 필수: 단순 요청(폼 전송 등)을 이용한 CSRF 차단
 */
export function localOnly(req: Request, res: Response, next: NextFunction) {
  const host = req.headers.host ?? '';
  if (!ALLOWED_HOSTS.has(host)) {
    return deny(res, 'INVALID_HOST', '허용되지 않은 Host입니다');
  }

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return deny(res, 'INVALID_ORIGIN', '허용되지 않은 출처입니다');
  }

  if (!SAFE_METHODS.has(req.method) && req.headers['x-localtotal'] !== '1') {
    return deny(
      res,
      'MISSING_HEADER',
      'LocalTotal UI에서 보낸 요청이 아닙니다',
    );
  }

  next();
}
