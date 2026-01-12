import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.modules';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, PrismaService, MailService],
})
export class ReservationsModule {}
