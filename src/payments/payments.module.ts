import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

// 🔌 Importando a nossa nova arquitetura modular:
import { MercadoPagoProvider } from './providers/mercado-pago.provider';
import { CheckoutService } from './services/checkout.service';
import { OrderFulfillmentService } from './services/order-fulfillment.service';
import { WebhookService } from './services/webhook.service';

// 📦 Mantendo as suas importações na força bruta:
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  imports: [], // 👈 Continua vazio, sem depender dos módulos dos outros
  controllers: [PaymentsController],
  providers: [
    // 👇 Nossos novos serviços modulares
    MercadoPagoProvider,
    CheckoutService,
    OrderFulfillmentService,
    WebhookService,

    // 👇 Suas dependências injetadas na força bruta
    PrismaService,
    MailService,
    ConfigService,
    NotificationsService,
  ],
  exports: [CheckoutService, WebhookService], // Exporta só o que for chamado de fora
})
export class PaymentsModule {}
