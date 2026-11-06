import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 로컬 UI에서 오는 요청만 허용
  app.enableCors({ origin: 'http://127.0.0.1:3000' });

  // 외부 접속 차단: 127.0.0.1에만 바인딩
  await app.listen(4000, '127.0.0.1');
}
void bootstrap();
