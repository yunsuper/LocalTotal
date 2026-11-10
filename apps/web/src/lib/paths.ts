// 결과 화면에서 경로의 파일명을 뽑는다.
// Windows 경로(C:\… 또는 \\서버\…)만 \와 /로 나누고, 그 밖의 경로는 M7 이전처럼 /로만 나눈다.
// macOS 파일명에는 \가 들어갈 수 있으므로 \로 나누면 안 된다 (paths.test.ts).

const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;

export const isWindowsPath = (p: string) => WINDOWS_PATH.test(p);

const split = (p: string) => (isWindowsPath(p) ? p.split(/[\\/]/) : p.split("/"));

/** 마지막 조각. M7 이전: p.split("/").pop() ?? p */
export function fileName(p: string): string {
    return split(p).pop() ?? p;
}

/** 빈 조각을 뺀 마지막 조각(폴더 경로 끝의 구분자 무시). M7 이전: p.split("/").filter(Boolean).pop() ?? p */
export function lastSegment(p: string): string {
    return split(p).filter(Boolean).pop() ?? p;
}
