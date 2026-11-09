import type {
  EngineResult,
  EngineVerdict,
} from '../engines/scan-engine.interface';
import { aggregateVerdict } from './verdict';

// 가짜 엔진 결과 — 실제 ClamAV·VirusTotal은 호출하지 않는다
const clam = (verdict: EngineVerdict): EngineResult => ({
  engine: 'clamav',
  verdict,
  durationMs: 1,
});

const vt = (malicious: number, suspicious = 0): EngineResult => ({
  engine: 'virustotal',
  verdict:
    malicious > 0 ? 'malicious' : suspicious > 0 ? 'suspicious' : 'clean',
  detail: { stats: { malicious, suspicious } },
  durationMs: 1,
});

const vtUnknown = (): EngineResult => ({
  engine: 'virustotal',
  verdict: 'unknown',
  durationMs: 1,
});

describe('aggregateVerdict', () => {
  describe('위험', () => {
    it('ClamAV가 탐지하면 VT가 0개여도 위험', () => {
      expect(aggregateVerdict([clam('malicious'), vt(0)])).toBe('danger');
    });

    it('ClamAV가 탐지하면 VT가 없어도 위험', () => {
      expect(aggregateVerdict([clam('malicious')])).toBe('danger');
    });

    it('VT malicious 5개는 위험 (경계값)', () => {
      expect(aggregateVerdict([clam('clean'), vt(5)])).toBe('danger');
    });

    it('ClamAV 오류여도 VT 5개 이상이면 위험', () => {
      expect(aggregateVerdict([clam('error'), vt(60)])).toBe('danger');
    });
  });

  describe('주의', () => {
    it('VT malicious 3개는 주의 (경계값)', () => {
      expect(aggregateVerdict([clam('clean'), vt(3)])).toBe('caution');
    });

    it('VT malicious 4개는 주의 (경계값)', () => {
      expect(aggregateVerdict([clam('clean'), vt(4)])).toBe('caution');
    });
  });

  describe('의심', () => {
    it('VT malicious 1개는 의심', () => {
      expect(aggregateVerdict([clam('clean'), vt(1)])).toBe('suspicious');
    });

    it('VT malicious 2개는 의심 (경계값)', () => {
      expect(aggregateVerdict([clam('clean'), vt(2)])).toBe('suspicious');
    });

    it('VT malicious 0개라도 suspicious 1개면 의심', () => {
      expect(aggregateVerdict([clam('clean'), vt(0, 1)])).toBe('suspicious');
    });
  });

  describe('오류', () => {
    it('ClamAV 오류이고 VT 근거가 없으면 오류', () => {
      expect(aggregateVerdict([clam('error'), vtUnknown()])).toBe('error');
    });

    it('ClamAV 오류이고 VT가 0개면 오류 (깨끗함으로 넘기지 않음)', () => {
      expect(aggregateVerdict([clam('error'), vt(0)])).toBe('error');
    });

    it('ClamAV 결과가 아예 없으면 오류', () => {
      expect(aggregateVerdict([vtUnknown()])).toBe('error');
    });

    it('결과가 비어 있으면 오류', () => {
      expect(aggregateVerdict([])).toBe('error');
    });
  });

  describe('깨끗함', () => {
    it('ClamAV 깨끗함 + VT 0개면 깨끗함', () => {
      expect(aggregateVerdict([clam('clean'), vt(0)])).toBe('clean');
    });

    it('VT 미등록이어도 ClamAV가 깨끗하면 깨끗함', () => {
      expect(aggregateVerdict([clam('clean'), vtUnknown()])).toBe('clean');
    });

    it('VT를 조회하지 않았어도 ClamAV가 깨끗하면 깨끗함', () => {
      expect(aggregateVerdict([clam('clean')])).toBe('clean');
    });
  });
});

// ── M7: Defender ────────────────────────────────────────────────────────
// M7 이전 구현 (macOS 동작 기준). 수정하지 말 것
function legacyAggregateVerdict(results: EngineResult[]) {
  const clamR = results.find((r) => r.engine === 'clamav');
  const vtR = results.find((r) => r.engine === 'virustotal');
  const vtStats = vtR?.detail?.stats as
    { malicious: number; suspicious: number } | undefined;
  if (clamR?.verdict === 'malicious') return 'danger';
  if (vtStats) {
    if (vtStats.malicious >= 5) return 'danger';
    if (vtStats.malicious >= 3) return 'caution';
    if (vtStats.malicious > 0 || vtStats.suspicious > 0) return 'suspicious';
  }
  if (!clamR || clamR.verdict === 'error') return 'error';
  return 'clean';
}

const defender = (
  verdict: EngineVerdict,
  threatName?: string,
): EngineResult => ({
  engine: 'defender',
  verdict,
  ...(threatName ? { threatName } : {}),
  durationMs: 1,
});

const CLAM_OPTIONS: (EngineResult | null)[] = [
  null,
  clam('clean'),
  clam('malicious'),
  clam('error'),
];
const VT_OPTIONS: (EngineResult | null)[] = [
  null,
  vtUnknown(),
  ...[0, 1, 2, 3, 4, 5, 60].map((n) => vt(n)),
  vt(0, 1),
  vt(2, 3),
];
const combos = CLAM_OPTIONS.flatMap((c) =>
  VT_OPTIONS.map((v) => [c, v].filter((r): r is EngineResult => r !== null)),
);

describe('aggregateVerdict — Defender 결과가 없으면 M7 이전과 같다', () => {
  it.each(
    combos.map(
      (c) =>
        [
          c
            .map(
              (r) =>
                `${r.engine}:${r.verdict}:${JSON.stringify(r.detail ?? {})}`,
            )
            .join(' + ') || '(결과 없음)',
          c,
        ] as const,
    ),
  )('%s', (_, results) => {
    expect(aggregateVerdict(results)).toBe(legacyAggregateVerdict(results));
  });
});

describe('aggregateVerdict — Defender (Windows)', () => {
  it('Defender 탐지는 위험 (ClamAV 깨끗함, VT 0개여도)', () => {
    expect(
      aggregateVerdict([
        clam('clean'),
        defender('malicious', 'Virus:DOS/EICAR_Test_File'),
        vt(0),
      ]),
    ).toBe('danger');
  });

  it('Defender 탐지는 ClamAV 오류여도 위험', () => {
    expect(aggregateVerdict([clam('error'), defender('malicious')])).toBe(
      'danger',
    );
  });

  it('Defender 오류 + ClamAV 깨끗함은 깨끗함 (전체를 오류로 만들지 않음)', () => {
    expect(aggregateVerdict([clam('clean'), defender('error')])).toBe('clean');
    expect(aggregateVerdict([clam('clean'), defender('error'), vt(0)])).toBe(
      'clean',
    );
  });

  it('Defender 오류는 VT 판정도 바꾸지 않는다', () => {
    expect(aggregateVerdict([clam('clean'), defender('error'), vt(3)])).toBe(
      'caution',
    );
    expect(aggregateVerdict([clam('clean'), defender('error'), vt(1)])).toBe(
      'suspicious',
    );
  });

  it('Defender 오류는 ClamAV·VT 조합의 판정을 바꾸지 않는다', () => {
    for (const c of combos) {
      expect(aggregateVerdict([...c, defender('error')])).toBe(
        legacyAggregateVerdict(c),
      );
    }
  });

  it('Defender 깨끗함은 "로컬 엔진이 하나도 검사하지 못한 오류"만 깨끗함으로 바꾼다', () => {
    for (const c of combos) {
      const legacy = legacyAggregateVerdict(c);
      expect(aggregateVerdict([...c, defender('clean')])).toBe(
        legacy === 'error' ? 'clean' : legacy,
      );
    }
  });

  it('ClamAV 오류 + Defender 깨끗함 = 깨끗함 (하나라도 정상 검사, 탐지 없음)', () => {
    expect(aggregateVerdict([clam('error'), defender('clean')])).toBe('clean');
    expect(
      aggregateVerdict([clam('error'), defender('clean'), vtUnknown()]),
    ).toBe('clean');
  });

  it('ClamAV 오류 + Defender 오류 = 오류 (둘 다 실패)', () => {
    expect(aggregateVerdict([clam('error'), defender('error')])).toBe('error');
    expect(aggregateVerdict([clam('error'), defender('error'), vt(0)])).toBe(
      'error',
    );
  });

  it('둘 다 실패해도 VT 근거가 있으면 VT 판정', () => {
    expect(aggregateVerdict([clam('error'), defender('error'), vt(5)])).toBe(
      'danger',
    );
    expect(aggregateVerdict([clam('error'), defender('error'), vt(1)])).toBe(
      'suspicious',
    );
  });

  it('ClamAV 결과가 없어도 Defender가 깨끗하면 깨끗함', () => {
    expect(aggregateVerdict([defender('clean')])).toBe('clean');
    expect(aggregateVerdict([defender('error')])).toBe('error');
  });
});
