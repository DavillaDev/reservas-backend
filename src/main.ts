// src/main.ts (Versão Final Corrigida)

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. Configuração do Validação Global (para o MasterKeyDto funcionar)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // 2. Habilita o Cookie Parser (requer instalação via npm)
  app.use(cookieParser());

  // 3. 🔑 CORREÇÃO CRÍTICA DO CORS PARA COOKIES

  // Lista de Strings Válidas (filtra undefined no nível do tipo TS)
  const frontendUrl = process.env.FRONTEND_URL;

  // Garante que a lista contenha apenas strings
  const allowedOrigins: string[] = [
    'http://localhost:3001',
    'http://localhost:3000',
    // 💡 Exemplo da sua URL Vercel
    'https://reservas-two-alpha.vercel.app',
  ];

  if (frontendUrl) {
    allowedOrigins.push(frontendUrl);
  }

  app.enableCors({
    origin: allowedOrigins, // Permite apenas domínios confiáveis
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // CRÍTICO: Permite que o Front-end envie/receba cookies
  }); // Configura a pasta 'uploads' para ser pública

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(3000);
}
bootstrap();
