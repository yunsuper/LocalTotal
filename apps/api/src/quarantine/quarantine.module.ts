import { Module } from '@nestjs/common';
import { ExclusionsModule } from '../exclusions/exclusions.module';
import { ScansModule } from '../scans/scans.module';
import { QuarantineController } from './quarantine.controller';
import { QuarantineService } from './quarantine.service';

@Module({
  imports: [ScansModule, ExclusionsModule],
  controllers: [QuarantineController],
  providers: [QuarantineService],
})
export class QuarantineModule {}
