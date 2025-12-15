import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  // Adicione <NestExpressApplication> aqui
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

  // Configura a pasta 'uploads' para ser pública
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(3000);
}
bootstrap();
