// api/src/nightclubs/nightclubs.module.ts (CORRIGIDO PARA O MASTER AUTH)

import { Module } from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { NightclubsController } from './nightclubs.controller';
import { PrismaService } from '../prisma.service';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';
import { ConfigModule } from '@nestjs/config'; // 🔑 1. IMPORTAÇÃO DO GUARD MASTER

@Module({
  imports: [
    // 🔑 ADICIONE ESTA LINHA: Torna o ConfigService disponível
    ConfigModule.forRoot({ isGlobal: true }), // Se já for global no AppModule, basta ConfigModule
  ],
  controllers: [NightclubsController],
  providers: [
    NightclubsService,
    PrismaService,
    MasterAuthGuard, // 🔑 2. ADICIONA O GUARD AOS PROVIDERS
  ],
})
export class NightclubsModule {}
