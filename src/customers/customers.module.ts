import { Module } from '@nestjs/common';
import { CustomersService } from './costumers.service';
import { CustomersController } from './costumers.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PrismaService],
  exports: [CustomersService],
})
export class CustomersModule {}
