import { EngineResult } from '../engines/scan-engine.interface';

/** excluded: 제외 규칙(건너뛰기)으로 엔진 검사를 하지 않은 파일 */
export type FinalVerdict =
  'danger' | 'caution' | 'suspicious' | 'clean' | 'error' | 'excluded';

const VT_DANGER_MIN = 5;
const VT_CAUTION_MIN = 3;

interface VtStats {
  malicious: number;
  suspicious: number;
}

/**
 * 판정 규칙 (위에서부터 먼저 맞는 것)
 * - 위험: ClamAV 탐지, 또는 VT malicious 5개 이상
 * - 주의: VT malicious 3~4개
 * - 의심: VT malicious 1~2개, 또는 VT suspicious 1개 이상
 * - 오류: ClamAV가 검사하지 못했고 VT 근거도 없음
 * - 깨끗함: 그 외 (VT 미등록·미조회 포함)
 */
export function aggregateVerdict(results: EngineResult[]): FinalVerdict {
  const clam = results.find((r) => r.engine === 'clamav');
  const vt = results.find((r) => r.engine === 'virustotal');
  const vtStats = vt?.detail?.stats as VtStats | undefined;

  if (clam?.verdict === 'malicious') return 'danger';
  if (vtStats) {
    if (vtStats.malicious >= VT_DANGER_MIN) return 'danger';
    if (vtStats.malicious >= VT_CAUTION_MIN) return 'caution';
    if (vtStats.malicious > 0 || vtStats.suspicious > 0) return 'suspicious';
  }
  if (!clam || clam.verdict === 'error') return 'error';
  return 'clean';
}
