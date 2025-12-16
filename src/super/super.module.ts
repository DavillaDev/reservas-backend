// src/super/super.module.ts

import { Module } from '@nestjs/common';
import { SuperController } from './super.controller';
import { SuperService } from './super.service';
import { MasterAuthGuard } from './guards/master-auth.guard'; // 🔑 Importação do Guard

@Module({
  imports: [], // Adicione outros módulos que o Super Service utiliza (ex: Prisma, AuthModule)
  controllers: [SuperController],
  providers: [
    SuperService,
    // 🔑 NOVO: Registra o Guard como um provedor para que o NestJS possa usá-lo via @UseGuards
    MasterAuthGuard,
  ],
})
export class SuperModule {}
