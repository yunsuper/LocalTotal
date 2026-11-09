import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EnginesService } from '../engines/engines.service';
import type {
  EngineResult,
  EngineVerdict,
} from '../engines/scan-engine.interface';
import {
  ExclusionMatcher,
  type ExclusionsService,
} from '../exclusions/exclusions.service';
import type { SettingsService } from '../settings/settings.service';
import { ScansService, type VtPolicy } from './scans.service';

// 가짜 엔진 — 실제 ClamAV·Defender·VirusTotal은 호출하지 않는다. 검사 대상은 임시 폴더의 평범한 텍스트 파일
function fakeEngines(clamVerdict: EngineVerdict, defVerdict: EngineVerdict) {
  const calls: string[] = [];
  const result = (engine: EngineResult['engine'], verdict: EngineVerdict) =>
    ({ engine, verdict, durationMs: 0 }) as EngineResult;
  const engines = {
    clamav: {
      scanFile: () => {
        calls.push('clamav');
        return Promise.resolve(result('clamav', clamVerdict));
      },
    },
    defender: {
      scanFile: () => {
        calls.push('defender');
        return Promise.resolve(result('defender', defVerdict));
      },
    },
    virustotal: {
      lookupHash: () => {
        calls.push('virustotal');
        return Promise.resolve(result('virustotal', 'unknown'));
      },
    },
  };
  return { engines: engines as unknown as EnginesService, calls };
}

// M7 이전 scanResolvedFile의 엔진 호출 부분 (macOS 동작 기준). 수정하지 말 것
async function legacyEngineResults(
  clamTask: () => Promise<EngineResult>,
  lookup: () => Promise<EngineResult>,
  vtPolicy: VtPolicy,
): Promise<EngineResult[]> {
  if (vtPolicy === 'always') return Promise.all([clamTask(), lookup()]);
  const clam = await clamTask();
  return vtPolicy === 'if-detected' && clam.verdict === 'malicious'
    ? [clam, await lookup()]
    : [clam];
}

describe('ScansService.scanResolvedFile', () => {
  let dir: string;
  let file: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'lt-scan-spec-'));
    file = join(dir, 'sample.txt');
    writeFileSync(file, 'LocalTotal test\n');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const service = (engines: EnginesService) =>
    new ScansService(engines, {} as ExclusionsService, {} as SettingsService);
  const matcher = new ExclusionMatcher([]);
  const POLICIES: VtPolicy[] = ['always', 'if-detected', 'never'];
  const CLAM: EngineVerdict[] = ['clean', 'malicious', 'error'];

  describe('Defender를 쓰지 않으면(macOS) M7 이전과 같다', () => {
    for (const useDefender of [undefined, false]) {
      for (const vtPolicy of POLICIES) {
        for (const clamVerdict of CLAM) {
          it(`useDefender=${useDefender}, VT ${vtPolicy}, ClamAV ${clamVerdict}`, async () => {
            const now = fakeEngines(clamVerdict, 'malicious');
            const before = fakeEngines(clamVerdict, 'malicious');
            const r = await service(now.engines).scanResolvedFile(file, {
              vtPolicy,
              matcher,
              maxFileSize: 1024 * 1024,
              ...(useDefender === undefined ? {} : { useDefender }),
            });
            const legacy = await legacyEngineResults(
              () => before.engines.clamav.scanFile(file),
              () => before.engines.virustotal.lookupHash(''),
              vtPolicy,
            );
            expect(r.results).toEqual(legacy);
            expect(now.calls).not.toContain('defender');
            expect([...now.calls].sort()).toEqual([...before.calls].sort());
          });
        }
      }
    }
  });

  describe('Defender 사용 (Windows)', () => {
    const scan = (
      clamVerdict: EngineVerdict,
      defVerdict: EngineVerdict,
      vtPolicy: VtPolicy,
    ) => {
      const f = fakeEngines(clamVerdict, defVerdict);
      return service(f.engines)
        .scanResolvedFile(file, {
          vtPolicy,
          matcher,
          maxFileSize: 1024 * 1024,
          useDefender: true,
        })
        .then((r) => ({ ...r, calls: f.calls }));
    };

    it('결과 순서: ClamAV, Defender, VirusTotal', async () => {
      const r = await scan('clean', 'clean', 'always');
      expect(r.results.map((x) => x.engine)).toEqual([
        'clamav',
        'defender',
        'virustotal',
      ]);
    });

    it('Defender만 탐지해도 위험이고, 탐지 파일만 모드에서 VT를 조회한다', async () => {
      const r = await scan('clean', 'malicious', 'if-detected');
      expect(r.verdict).toBe('danger');
      expect(r.calls).toContain('virustotal');
      expect(r.externalSent).toBe('sha256');
    });

    it('둘 다 탐지 못 하면 탐지 파일만 모드에서 VT를 조회하지 않는다', async () => {
      const r = await scan('clean', 'clean', 'if-detected');
      expect(r.calls).not.toContain('virustotal');
      expect(r.externalSent).toBe('none');
    });

    it('Defender 오류 + ClamAV 깨끗함 = 깨끗함', async () => {
      expect((await scan('clean', 'error', 'never')).verdict).toBe('clean');
    });

    it('크기 초과로 ClamAV를 건너뛰어도 Defender는 검사한다', async () => {
      const f = fakeEngines('clean', 'malicious');
      const r = await service(f.engines).scanResolvedFile(file, {
        vtPolicy: 'never',
        matcher,
        maxFileSize: 1, // 파일보다 작게
        useDefender: true,
      });
      expect(f.calls).toEqual(['defender']);
      expect(r.results[0]).toMatchObject({
        engine: 'clamav',
        verdict: 'error',
      });
      expect(r.verdict).toBe('danger');
    });

    it('크기 초과(ClamAV 오류) + Defender 깨끗함 = 깨끗함, ClamAV 오류는 결과에 남는다', async () => {
      const f = fakeEngines('clean', 'clean');
      const r = await service(f.engines).scanResolvedFile(file, {
        vtPolicy: 'never',
        matcher,
        maxFileSize: 1,
        useDefender: true,
      });
      expect(r.verdict).toBe('clean');
      expect(r.results[0].verdict).toBe('error');
      expect(String(r.results[0].detail?.message)).toContain('크기 초과');
    });

    it('ClamAV 오류 + Defender 오류 = 오류', async () => {
      expect((await scan('error', 'error', 'never')).verdict).toBe('error');
    });
  });
});
