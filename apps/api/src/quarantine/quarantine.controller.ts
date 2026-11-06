import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { QuarantineService } from './quarantine.service';
import type { QuarantineEntry } from './quarantine.service';

interface QuarantineBody {
  scanId?: unknown;
  path?: unknown;
}

@Controller('quarantine')
export class QuarantineController {
  constructor(private readonly quarantine: QuarantineService) {}

  @Get()
  list(): Promise<QuarantineEntry[]> {
    return this.quarantine.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: QuarantineBody): Promise<QuarantineEntry> {
    if (typeof body?.scanId !== 'string' || typeof body?.path !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'scanId와 path가 필요합니다',
      });
    }
    return this.quarantine.quarantine(body.scanId, body.path);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string): Promise<{ restoredPath: string }> {
    return this.quarantine.restore(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ removed: true }> {
    return this.quarantine.remove(id);
  }
}
