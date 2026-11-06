import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnginesModule } from './engines/engines.module';
import { ExclusionsModule } from './exclusions/exclusions.module';
import { QuarantineModule } from './quarantine/quarantine.module';
import { ScansModule } from './scans/scans.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EnginesModule,
    SettingsModule,
    ExclusionsModule,
    ScansModule,
    QuarantineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
