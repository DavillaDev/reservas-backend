// api/src/nightclubs/nightclubs.module.ts (CORRIGIDO PARA O MASTER AUTH)

import { Module } from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { NightclubsController } from './nightclubs.controller';
import { PrismaService } from '../prisma.service';
import { MasterAuthGuard } from '../super/guards/master-auth.guard'; // 🔑 1. IMPORTAÇÃO DO GUARD MASTER

@Module({
  controllers: [NightclubsController],
  providers: [
    NightclubsService,
    PrismaService,
    MasterAuthGuard, // 🔑 2. ADICIONA O GUARD AOS PROVIDERS
  ],
})
export class NightclubsModule {}
