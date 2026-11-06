import { Module } from '@nestjs/common';
import { ClamavEngine } from './clamav.engine';
import { EnginesController } from './engines.controller';
import { EnginesService } from './engines.service';
import { VirusTotalEngine } from './virustotal.engine';

@Module({
  controllers: [EnginesController],
  providers: [ClamavEngine, VirusTotalEngine, EnginesService],
  exports: [EnginesService],
})
export class EnginesModule {}
