import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

// Vamos importar as classes DIRETAMENTE
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  imports: [], // 👈 Vazio, não vamos depender dos módulos dos outros
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // 👇 Injetamos TUDO que o construtor do PaymentsService pede, na força bruta.
    PrismaService,
    MailService,
    ConfigService,
    NotificationsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
