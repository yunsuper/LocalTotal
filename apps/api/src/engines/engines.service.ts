import { Injectable } from '@nestjs/common';
import { ClamavEngine } from './clamav.engine';
import { DefenderEngine } from './defender.engine';
import type {
  EngineName,
  EngineNotice,
  ScanEngine,
} from './scan-engine.interface';
import { VirusTotalEngine } from './virustotal.engine';

export interface EngineStatus {
  name: EngineName;
  available: boolean;
  version: string | null;
  usage?: { today: number; limit: number };
  notice?: EngineNotice;
}

/** 상태 표시에 쓰는 엔진 목록. Defender는 Windows에서만 (macOS는 M7 이전과 같음, engines.service.spec.ts) */
export function activeEngines<T>(
  platform: NodeJS.Platform,
  e: { clamav: T; defender: T; virustotal: T },
): T[] {
  return platform === 'win32'
    ? [e.clamav, e.defender, e.virustotal]
    : [e.clamav, e.virustotal];
}

@Injectable()
export class EnginesService {
  private readonly engines: ScanEngine[];

  constructor(
    readonly clamav: ClamavEngine,
    readonly virustotal: VirusTotalEngine,
    readonly defender: DefenderEngine,
  ) {
    this.engines = activeEngines<ScanEngine>(process.platform, {
      clamav,
      defender,
      virustotal,
    });
  }

  async status(): Promise<EngineStatus[]> {
    return Promise.all(
      this.engines.map(async (e) => {
        const available = await e.isAvailable();
        const notice = await e.notice?.();
        return {
          name: e.name,
          available,
          version: available ? await e.version() : null,
          ...(e.name === 'virustotal'
            ? { usage: this.virustotal.usage() }
            : {}),
          ...(notice ? { notice } : {}),
        };
      }),
    );
  }
}
