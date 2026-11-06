import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngineResult, ScanEngine } from './scan-engine.interface';

const BASE_URL = 'https://www.virustotal.com/api/v3';
const MIN_INTERVAL_MS = 15_500; // 무료 API: 분당 4회

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

/**
 * 해시 조회 전용. 파일 업로드 메서드는 의도적으로 만들지 않는다.
 */
@Injectable()
export class VirusTotalEngine implements ScanEngine {
  readonly name = 'virustotal' as const;
  private readonly apiKey: string | undefined;
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

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

  async lookupHash(sha256: string): Promise<EngineResult> {
    const started = Date.now();
    const error = (message: string): EngineResult => ({
      engine: this.name,
      verdict: 'error',
      detail: { message },
      durationMs: Date.now() - started,
    });

    if (!this.apiKey) return error('VT_API_KEY가 설정되지 않음');
    if (!/^[a-f0-9]{64}$/i.test(sha256)) return error('잘못된 SHA-256');

    try {
      const res = await this.throttled(() =>
        fetch(`${BASE_URL}/files/${sha256}`, {
          headers: {
            'x-apikey': this.apiKey as string,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        }),
      );

      if (res.status === 404) {
        return {
          engine: this.name,
          verdict: 'unknown',
          detail: { message: 'VirusTotal 미등록 파일' },
          durationMs: Date.now() - started,
        };
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

      return {
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
    } catch (err) {
      return error((err as Error).message);
    }
  }

  // 요청을 한 줄로 세우고 최소 간격을 지킨다
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
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
