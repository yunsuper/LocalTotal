import { Injectable } from '@nestjs/common';
import { ClamavEngine } from './clamav.engine';
import { EngineName, ScanEngine } from './scan-engine.interface';
import { VirusTotalEngine } from './virustotal.engine';

export interface EngineStatus {
  name: EngineName;
  available: boolean;
  version: string | null;
}

@Injectable()
export class EnginesService {
  private readonly engines: ScanEngine[];

  constructor(
    readonly clamav: ClamavEngine,
    readonly virustotal: VirusTotalEngine,
  ) {
    // Defender는 Windows(M7)에서 추가
    this.engines = [clamav, virustotal];
  }

  async status(): Promise<EngineStatus[]> {
    return Promise.all(
      this.engines.map(async (e) => {
        const available = await e.isAvailable();
        return {
          name: e.name,
          available,
          version: available ? await e.version() : null,
        };
      }),
    );
  }
}
