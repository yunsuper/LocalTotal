import type { FileScanResult } from "./types";

// 로컬 엔진(ClamAV·Defender) 중 하나가 오류를 냈는지.
// Windows에서는 다른 로컬 엔진이 정상 검사하면 "깨끗함"이 되므로, 이런 파일은 접힌 목록 대신
// 결과 카드로 보여 엔진별 오류를 숨기지 않는다.
// macOS의 깨끗함은 ClamAV가 정상 검사한 경우뿐이라 항상 false (M7 이전 화면 유지, results.test.mts).
// VirusTotal 오류는 포함하지 않는다(맥에서도 ClamAV 깨끗함 + VT 오류 = 깨끗함, 이전처럼 접힌 목록).
export function hasLocalEngineError(result: FileScanResult): boolean {
    return result.results.some(
        (r) =>
            (r.engine === "clamav" || r.engine === "defender") &&
            r.verdict === "error",
    );
}
