/**
 * 사용자가 붙여넣은 경로를 정리한다.
 * Windows 탐색기의 "경로로 복사"(Ctrl+Shift+C)는 "C:\폴더\파일"처럼 큰따옴표로 감싸므로 벗긴다.
 * macOS에서는 앞뒤 공백만 지운다(M7 이전과 동일, input-path.spec.ts).
 */
export function normalizeInputPath(
  raw: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const trimmed = raw.trim();
  if (platform !== 'win32') return trimmed;
  const quoted = /^"(.*)"$/s.exec(trimmed);
  return quoted ? quoted[1].trim() : trimmed;
}
