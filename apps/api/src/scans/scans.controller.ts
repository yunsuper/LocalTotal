import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ScanJobsService } from './scan-jobs.service';
import type { ScanJobDetail, ScanJobSummary } from './scan-jobs.service';
import { ScansService } from './scans.service';
import type { FileScanResult } from './scans.service';

interface ScanFileBody {
  path?: unknown;
  useVirusTotal?: unknown;
}

interface StartScanBody {
  paths?: unknown;
  useVirusTotal?: unknown;
}

// 명시적인 true/false만 받고, 없으면 설정값을 따른다
const optionalBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

@Controller('scans')
export class ScansController {
  constructor(
    private readonly scans: ScansService,
    private readonly jobs: ScanJobsService,
  ) {}

  /** 단일 파일 즉시 검사 */
  @Post('file')
  @HttpCode(200)
  scanFile(@Body() body: ScanFileBody): Promise<FileScanResult> {
    if (typeof body?.path !== 'string' || !body.path.trim()) {
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: 'path가 필요합니다',
      });
    }
    return this.scans.scanFile(
      body.path.trim(),
      optionalBool(body.useVirusTotal),
    );
  }

  /** 파일·폴더 검사 작업 시작 → scanId */
  @Post()
  @HttpCode(202)
  start(@Body() body: StartScanBody): Promise<{ scanId: string }> {
    const paths = Array.isArray(body?.paths)
      ? body.paths
          .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
          .map((p) => p.trim())
      : [];
    if (paths.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: 'paths가 필요합니다',
      });
    }
    return this.jobs.start(paths, optionalBool(body.useVirusTotal));
  }

  @Get(':id')
  detail(@Param('id') id: string): ScanJobDetail {
    return this.jobs.detail(id);
  }

  /** 진행 상황 SSE: progress / result / done */
  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.jobs.events(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): ScanJobSummary {
    return this.jobs.cancel(id);
  }
}
