// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ✅ Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // ✅ Origens permitidas
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://reservas-two-alpha.vercel.app',
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  // ✅ CORS CORRETO PARA COOKIE (produção-safe)
  app.enableCors({
    origin: (origin, callback) => {
      // Permite chamadas sem origin (SSR, healthcheck, etc)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // ✅ Static uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // ✅ Porta correta para Render / Docker
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
