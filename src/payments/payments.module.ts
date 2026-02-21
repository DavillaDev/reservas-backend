import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

// 👇 Importa o Service direto (já que não tem módulo)
import { MailService } from '../mail/mail.service';
// 👇 Importa o Módulo de Notificações (esse eu vi que existe!)
import { NotificationsModule } from '../notifications/notifications.modules';

@Module({
  imports: [
    NotificationsModule, // 👈 Importa só o módulo que existe
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MailService, // 👈 Injeta o MailService solto direto aqui!
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
