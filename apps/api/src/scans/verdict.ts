import { EngineResult } from '../engines/scan-engine.interface';

export type FinalVerdict = 'danger' | 'suspicious' | 'clean' | 'error';

const VT_DANGER_THRESHOLD = 3;

interface VtStats {
  malicious: number;
  suspicious: number;
}

/**
 * 판정 규칙
 * - 위험: ClamAV 탐지, 또는 VT malicious 3개 이상
 * - 의심: VT malicious 1~2개, 또는 VT suspicious 1개 이상
 * - 오류: ClamAV가 검사하지 못했고 VT에서도 위험·의심 근거가 없음
 * - 깨끗함: 그 외 (VT 미등록·미조회 포함)
 */
export function aggregateVerdict(results: EngineResult[]): FinalVerdict {
  const clam = results.find((r) => r.engine === 'clamav');
  const vt = results.find((r) => r.engine === 'virustotal');
  const vtStats = vt?.detail?.stats as VtStats | undefined;

  if (clam?.verdict === 'malicious') return 'danger';
  if (vtStats && vtStats.malicious >= VT_DANGER_THRESHOLD) return 'danger';
  if (vtStats && (vtStats.malicious > 0 || vtStats.suspicious > 0))
    return 'suspicious';
  if (!clam || clam.verdict === 'error') return 'error';
  return 'clean';
}
