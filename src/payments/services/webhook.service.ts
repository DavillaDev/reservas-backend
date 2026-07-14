import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoProvider } from '../providers/mercado-pago.provider';
import { OrderFulfillmentService } from './order-fulfillment.service';
import { addYears } from 'date-fns';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private mercadoPagoProvider: MercadoPagoProvider,
    private orderFulfillmentService: OrderFulfillmentService,
  ) {}

  async processWebhook(paymentId: string) {
    const platformToken = this.configService.get<string>(
      'MP_PLATFORM_ACCESS_TOKEN',
    );

    if (!platformToken) {
      this.logger.error(
        'MP_PLATFORM_ACCESS_TOKEN ausente. Impossível processar webhook de forma segura.',
      );
      return;
    }

    try {
      // 1. Busca os dados REAIS e blindados lá no Mercado Pago
      const paymentData: any = await this.mercadoPagoProvider.getPaymentStatus(
        platformToken,
        paymentId,
      );

      // Se não estiver aprovado (ex: gerou o pix mas não pagou, ou cartão recusado), apenas ignora.
      if (paymentData.status !== 'approved') return;

      const externalRef = paymentData.external_reference;

      // =================================================================
      // 🛑 CASO A: UPGRADE DE PLANO PREMIUM (SaaS da Balada)
      // =================================================================
      if (externalRef && externalRef.startsWith('PREMIUM_UPGRADE:')) {
        const nightclubId = externalRef.split(':')[1];
        await this.prisma.nightclub.update({
          where: { id: nightclubId },
          data: { plan: 'PREMIUM', planExpiresAt: addYears(new Date(), 1) },
        });
        this.logger.log(`✨ [WEBHOOK] Balada ${nightclubId} agora é PREMIUM!`);
        return;
      }

      // =================================================================
      // 🛑 CASO B: RESERVA DE CLIENTE NA BALADA
      // =================================================================
      const reservation = await this.prisma.reservation.findFirst({
        where: {
          OR: [
            { id: externalRef || undefined },
            { paymentId: paymentId.toString() },
          ],
        },
        include: { nightclub: true },
      });

      if (!reservation) {
        this.logger.warn(
          `❌ [WEBHOOK] Reserva não encontrada para o Pagamento MP: ${paymentId}`,
        );
        return;
      }

      // 🛡️ Trava de Duplicidade (Idempotência)
      if (
        reservation.status === 'CONFIRMED' ||
        reservation.status === 'CHECKED_IN'
      ) {
        this.logger.log(
          `⚠️ [WEBHOOK] Ignorando notificação duplicada. Reserva ${reservation.id} já confirmada.`,
        );
        return;
      }

      // 2. Chama o entregador para finalizar a venda!
      await this.orderFulfillmentService.confirmReservation(
        reservation.id,
        paymentId,
      );
    } catch (error: any) {
      this.logger.error('❌ Erro crítico ao processar Webhook:', error.message);
    }
  }
}
