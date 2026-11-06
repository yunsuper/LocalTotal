import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { AppSettings } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<AppSettings> {
    return this.settings.get();
  }

  @Put()
  update(@Body() body: Record<string, unknown>): Promise<AppSettings> {
    return this.settings.update(body ?? {});
  }
}
