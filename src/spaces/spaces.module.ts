// api/src/spaces/spaces.module.ts
import { Module } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { SpacesController } from './spaces.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SpacesController],
  providers: [SpacesService, PrismaService],
})
export class SpacesModule {}
