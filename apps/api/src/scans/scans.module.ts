import { Module } from '@nestjs/common';
import { EnginesModule } from '../engines/engines.module';
import { ScanJobsService } from './scan-jobs.service';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

@Module({
  imports: [EnginesModule],
  controllers: [ScansController],
  providers: [ScansService, ScanJobsService],
  exports: [ScanJobsService],
})
export class ScansModule {}
