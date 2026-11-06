import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { sha256File } from '../common/file-hash';
import { EnginesService } from '../engines/engines.service';
import { EngineResult } from '../engines/scan-engine.interface';
import { aggregateVerdict, FinalVerdict } from './verdict';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // clamd.conf StreamMaxLength와 맞춤

export interface FileScanResult {
  path: string;
  size: number;
  sha256: string;
  verdict: FinalVerdict;
  results: EngineResult[];
  externalSent: 'sha256' | 'none';
  scannedAt: string;
}

@Injectable()
export class ScansService {
  constructor(private readonly engines: EnginesService) {}

  async scanFile(
    inputPath: string,
    useVirusTotal: boolean,
  ): Promise<FileScanResult> {
    const absPath = await this.resolveReadableFile(inputPath);
    const { size } = await stat(absPath);
    const sha256 = await sha256File(absPath);

    const tasks: Promise<EngineResult>[] = [
      size > MAX_FILE_SIZE
        ? Promise.resolve<EngineResult>({
            engine: 'clamav',
            verdict: 'error',
            detail: {
              message: `크기 초과 (${Math.round(size / 1024 / 1024)}MB > 200MB)`,
            },
            durationMs: 0,
          })
        : this.engines.clamav.scanFile(absPath),
    ];

    const vtOn = useVirusTotal && (await this.engines.virustotal.isAvailable());
    if (vtOn) tasks.push(this.engines.virustotal.lookupHash(sha256));

    const results = await Promise.all(tasks);

    return {
      path: absPath,
      size,
      sha256,
      verdict: aggregateVerdict(results),
      results,
      externalSent: vtOn ? 'sha256' : 'none',
      scannedAt: new Date().toISOString(),
    };
  }

  private async resolveReadableFile(inputPath: string): Promise<string> {
    if (!isAbsolute(inputPath)) {
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: '절대 경로를 입력해야 합니다',
      });
    }
    try {
      const real = await realpath(inputPath);
      const info = await stat(real);
      if (!info.isFile()) {
        throw new BadRequestException({
          code: 'NOT_A_FILE',
          message: '파일 경로가 아닙니다',
        });
      }
      await access(real, constants.R_OK);
      return real;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '파일을 찾을 수 없습니다',
        });
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ForbiddenException({
          code: 'NO_PERMISSION',
          message: '읽기 권한이 없습니다 (VS Code 전체 디스크 접근 권한 확인)',
        });
      }
      throw err;
    }
  }
}
