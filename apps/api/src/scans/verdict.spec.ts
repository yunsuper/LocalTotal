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
  verdict: malicious > 0 ? 'malicious' : suspicious > 0 ? 'suspicious' : 'clean',
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
