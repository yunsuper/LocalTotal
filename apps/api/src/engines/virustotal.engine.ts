import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngineResult, ScanEngine } from './scan-engine.interface';

const BASE_URL = 'https://www.virustotal.com/api/v3';
const MIN_INTERVAL_MS = 15_500; // 무료 API: 분당 4회
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 메모리 캐시 24시간 (서버 재시작 시 초기화)
export const VT_DAILY_LIMIT = 500;
const DAILY_STOP_AT = 480; // 한도 직전에서 멈춤

interface VtAnalysisStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
  [key: string]: number;
}

interface VtFileResponse {
  data: {
    attributes: {
      last_analysis_stats: VtAnalysisStats;
      popular_threat_classification?: { suggested_threat_label?: string };
    };
  };
}

const localDate = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬 시간)

/**
 * 해시 조회 전용. 파일 업로드 메서드는 의도적으로 만들지 않는다.
 */
@Injectable()
export class VirusTotalEngine implements ScanEngine {
  readonly name = 'virustotal' as const;
  private readonly apiKey: string | undefined;
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<
    string,
    { result: EngineResult; at: number }
  >();
  private readonly inflight = new Map<string, Promise<EngineResult>>();
  private usageDate = localDate();
  private usageCount = 0;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('VT_API_KEY') || undefined;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async version(): Promise<string | null> {
    return 'API v3 (hash lookup only)';
  }

  // absPath는 받지만 쓰지 않는다: 외부로 나가는 것은 sha256뿐
  async scanFile(_absPath: string, sha256: string): Promise<EngineResult> {
    return this.lookupHash(sha256);
  }

  usage(): { today: number; limit: number } {
    this.rollDate();
    return { today: this.usageCount, limit: VT_DAILY_LIMIT };
  }

  async lookupHash(sha256: string): Promise<EngineResult> {
    const key = sha256.toLowerCase();

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return {
        ...cached.result,
        detail: { ...(cached.result.detail ?? {}), cached: true },
        durationMs: 0,
      };
    }

    // 같은 해시를 동시에 요청하면 한 번만 보낸다
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const request = this.fetchHash(key).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, request);
    return request;
  }

  private async fetchHash(sha256: string): Promise<EngineResult> {
    const started = Date.now();
    const error = (message: string): EngineResult => ({
      engine: this.name,
      verdict: 'error',
      detail: { message },
      durationMs: Date.now() - started,
    });

    if (!this.apiKey) return error('VT_API_KEY가 설정되지 않음');
    if (!/^[a-f0-9]{64}$/.test(sha256)) return error('잘못된 SHA-256');

    try {
      const res = await this.throttled(() => {
        this.rollDate();
        if (this.usageCount >= DAILY_STOP_AT) return null;
        this.usageCount++;
        return fetch(`${BASE_URL}/files/${sha256}`, {
          headers: {
            'x-apikey': this.apiKey as string,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        });
      });

      if (!res)
        return error(
          `오늘 VirusTotal 조회 한도에 가까워 멈췄어요 (${DAILY_STOP_AT}회)`,
        );

      if (res.status === 404) {
        const result: EngineResult = {
          engine: this.name,
          verdict: 'unknown',
          detail: { message: 'VirusTotal 미등록 파일' },
          durationMs: Date.now() - started,
        };
        this.cache.set(sha256, { result, at: Date.now() });
        return result;
      }
      if (res.status === 429) return error('VirusTotal 요청 한도 초과');
      if (!res.ok) return error(`VirusTotal HTTP ${res.status}`);

      const body = (await res.json()) as VtFileResponse;
      const stats = body.data.attributes.last_analysis_stats;
      const verdict =
        stats.malicious > 0
          ? 'malicious'
          : stats.suspicious > 0
            ? 'suspicious'
            : 'clean';

      const result: EngineResult = {
        engine: this.name,
        verdict,
        threatName:
          body.data.attributes.popular_threat_classification
            ?.suggested_threat_label,
        detail: {
          stats,
          link: `https://www.virustotal.com/gui/file/${sha256}`,
        },
        durationMs: Date.now() - started,
      };
      this.cache.set(sha256, { result, at: Date.now() });
      return result;
    } catch (err) {
      return error((err as Error).message);
    }
  }

  private rollDate() {
    const today = localDate();
    if (today !== this.usageDate) {
      this.usageDate = today;
      this.usageCount = 0;
    }
  }

  // 요청을 한 줄로 세우고 최소 간격을 지킨다
  private throttled<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
