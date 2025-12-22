import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // 👇 AQUI NÓS FORÇAMOS A CONFIGURAÇÃO
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // 👇 Aumentamos a paciência do banco para logs e conexões
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    // 👇 Tentativa de conexão com retry manual (Resiliência)
    try {
      await this.$connect();
    } catch (error) {
      console.warn(
        '⚠️ Falha inicial no DB. O Nest vai tentar de novo na primeira requisição.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
