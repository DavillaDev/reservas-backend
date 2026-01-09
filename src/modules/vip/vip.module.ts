import { Module } from '@nestjs/common';
import { VipService } from './vip.service';
import { VipController } from './vip.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
