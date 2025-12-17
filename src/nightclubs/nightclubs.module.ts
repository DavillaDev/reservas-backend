import { Module } from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { NightclubsController } from './nightclubs.controller';
import { PrismaService } from '../prisma.service';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    // 🛡️ O ConfigModule deve estar aqui para o ConfigService funcionar no Service
    ConfigModule,
  ],
  controllers: [NightclubsController],
  providers: [NightclubsService, PrismaService, MasterAuthGuard],
  exports: [NightclubsService], // Importante para que outros módulos acessem este service
})
export class NightclubsModule {}
