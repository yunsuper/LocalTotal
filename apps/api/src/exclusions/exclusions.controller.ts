import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ExclusionsService } from './exclusions.service';
import type { Exclusion } from './exclusions.service';

@Controller('exclusions')
export class ExclusionsController {
  constructor(private readonly exclusions: ExclusionsService) {}

  @Get()
  list(): Promise<Exclusion[]> {
    return this.exclusions.list();
  }

  @Post()
  add(@Body() body: Record<string, unknown>): Promise<Exclusion> {
    return this.exclusions.add(body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ removed: true }> {
    return this.exclusions.remove(id);
  }
}
