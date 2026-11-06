import { Module } from '@nestjs/common';
import { ScansModule } from '../scans/scans.module';
import { QuarantineController } from './quarantine.controller';
import { QuarantineService } from './quarantine.service';

@Module({
  imports: [ScansModule],
  controllers: [QuarantineController],
  providers: [QuarantineService],
})
export class QuarantineModule {}
