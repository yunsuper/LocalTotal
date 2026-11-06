import { Module } from '@nestjs/common';
import { EnginesModule } from '../engines/engines.module';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

@Module({
  imports: [EnginesModule],
  controllers: [ScansController],
  providers: [ScansService],
})
export class ScansModule {}
