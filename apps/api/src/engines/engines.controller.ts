import { Controller, Get } from '@nestjs/common';
import { EnginesService, EngineStatus } from './engines.service';

@Controller('engines')
export class EnginesController {
  constructor(private readonly engines: EnginesService) {}

  @Get()
  status(): Promise<EngineStatus[]> {
    return this.engines.status();
  }
}
