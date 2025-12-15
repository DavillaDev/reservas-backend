// api/src/nightclubs/nightclubs.module.ts
import { Module } from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { NightclubsController } from './nightclubs.controller';
import { PrismaService } from '../prisma.service'; 

@Module({
  controllers: [NightclubsController],
  providers: [NightclubsService, PrismaService], 
})
export class NightclubsModule {}
