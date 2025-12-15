// api/src/reservations/reservations.module.ts
import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, PrismaService, MailService],
})
export class ReservationsModule {}
