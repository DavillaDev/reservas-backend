// src/main.ts (CORREÇÃO FINAL: ATIVANDO O COOKIE PARSER)

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser from 'cookie-parser'; // 🔑 Importado
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule); // ✅ Validação global

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // 🔑 CORREÇÃO CRÍTICA: ATIVANDO O COOKIE PARSER COMO MIDDLEWARE
  app.use(cookieParser()); // ✅ Origens permitidas

  const allowedOrigins: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://reservas-two-alpha.vercel.app',
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  // 💡 Remove undefined no nível de tipo, se houver:
  const origins = allowedOrigins.filter((o) => !!o) as (string | RegExp)[]; // ✅ CORS CORRETO PARA COOKIE

  app.enableCors({
    origin: (origin, callback) => {
      // Permite chamadas sem origin (SSR, healthcheck, etc)
      if (!origin) return callback(null, true);

      if (origins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  }); // ✅ Static uploads

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  }); // ✅ Porta correta para Render / Docker

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
