import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { FileScanResult, ScansService } from './scans.service';

interface ScanFileBody {
  path?: unknown;
  useVirusTotal?: unknown;
}

@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post('file')
  @HttpCode(200)
  scanFile(@Body() body: ScanFileBody): Promise<FileScanResult> {
    if (typeof body?.path !== 'string' || !body.path.trim()) {
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: 'path가 필요합니다',
      });
    }
    // 단일 파일은 기본으로 VT 조회 (명시적으로 false일 때만 끔)
    const useVirusTotal = body.useVirusTotal !== false;
    return this.scans.scanFile(body.path.trim(), useVirusTotal);
  }
}
