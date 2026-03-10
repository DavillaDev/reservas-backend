import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago'; // 👈 Adicionado Preference
import { addMinutes, addYears, isAfter } from 'date-fns'; // 👈 Adicionado addYears
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '../common/utils/encryption.util';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  // ===========================================================================
  // 1. CHECKOUT (RESERVAS)
  // ===========================================================================
  async getCheckoutData(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada.');

    if (
      reservation.status === 'CONFIRMED' ||
      reservation.status === 'CHECKED_IN'
    ) {
      return { status: 'PAID', reservation };
    }

    if (
      reservation.paymentDeadline &&
      isAfter(new Date(), new Date(reservation.paymentDeadline))
    ) {
      await this.prisma.reservation.update({
        where: { id },
        data: { status: 'CANCELED' },
      });
      throw new ConflictException('O prazo para pagamento expirou.');
    }

    const pixData = await this.generatePix(id);
    return { status: 'PENDING', reservation, pix: pixData };
  }

  // ===========================================================================
  // 2. GERAR PIX (RESERVAS)
  // ===========================================================================
  async generatePix(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        nightclub: true,
        space: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada.');
    }

    const percentage = reservation.nightclub.appFeePercent
      ? Number(reservation.nightclub.appFeePercent) / 100
      : 0.05;

    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');
    const rawToken = reservation.nightclub.mpAccessToken;

    const accessTokenParaUsar =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || platformToken;

    const client = new MercadoPagoConfig({ accessToken: accessTokenParaUsar });
    const payment = new Payment(client);

    try {
      // 1. Tentar recuperar pagamento existente
      if (
        reservation.paymentId &&
        reservation.paymentDeadline &&
        new Date(reservation.paymentDeadline) > new Date()
      ) {
        try {
          const existing = await payment.get({ id: reservation.paymentId });

          if (existing.status === 'approved') {
            return { status: 'PAID' };
          }

          if (existing.status === 'pending') {
            return {
              qrCodeBase64:
                existing.point_of_interaction?.transaction_data?.qr_code_base64,
              pixCode: existing.point_of_interaction?.transaction_data?.qr_code,
              paymentId: existing.id,
              amount: reservation.amount,
              expiresAt: reservation.paymentDeadline,
            };
          }
        } catch (e) {
          console.warn(
            `[MP_RECOVERY_WARN] Erro ao recuperar ${reservation.paymentId}`,
          );
        }
      }

      // 2. Gerar novo pagamento
      const expiresAtDate = addMinutes(new Date(), 20);
      const amount = Number(reservation.amount || reservation.space.price || 0);
      const validEmail = reservation.customerEmail?.includes('@')
        ? reservation.customerEmail.trim().toLowerCase()
        : `cliente.${reservation.id.substring(0, 5)}@reservasclub.com.br`;

      const myFee = Number((amount * percentage).toFixed(2));

      const paymentBody: any = {
        transaction_amount: amount,
        description: `Reserva: ${reservation.nightclub.name} - ${reservation.space.name}`,
        payment_method_id: 'pix',
        payer: {
          email: validEmail,
          first_name: reservation.customerName.split(' ')[0] || 'Cliente',
        },
        notification_url: `https://reservas-backend-fa4b.onrender.com/payments/webhook`,
        date_of_expiration: expiresAtDate.toISOString(),
        external_reference: reservation.id,
      };

      if (rawToken && amount > 2) {
        paymentBody.application_fee = myFee;
      }

      let response;
      try {
        response = await payment.create({ body: paymentBody });
      } catch (mpError: any) {
        const errorData = mpError.response?.data || {};
        const errorMsg = errorData.message || mpError.message || '';

        if (errorMsg.includes('application_fee')) {
          delete paymentBody.application_fee;
          response = await payment.create({ body: paymentBody });
        } else {
          throw mpError;
        }
      }

      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          paymentId: response.id?.toString(),
          paymentDeadline: expiresAtDate,
          status: 'PENDING',
        },
      });

      return {
        qrCodeBase64:
          response.point_of_interaction?.transaction_data?.qr_code_base64,
        pixCode: response.point_of_interaction?.transaction_data?.qr_code,
        paymentId: response.id,
        amount,
        expiresAt: expiresAtDate,
      };
    } catch (error: any) {
      if (error.status === 429) {
        throw new BadRequestException(
          'Muitas requisições. Aguarde alguns segundos.',
        );
      }
      console.error(
        '❌ ERRO MERCADO PAGO:',
        error.response?.data || error.message,
      );
      throw new BadRequestException('Erro ao processar pagamento.');
    }
  }

  // ===========================================================================
  // 3. UPGRADE PREMIUM (NOVO)
  // ===========================================================================
  async createPremiumPreference(nightclubId: string) {
    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id: nightclubId },
    });

    if (!nightclub) throw new NotFoundException('Balada não encontrada.');

    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');
    const client = new MercadoPagoConfig({ accessToken: platformToken });
    const preference = new Preference(client);

    try {
      const response = await preference.create({
        body: {
          items: [
            {
              id: 'premium-plan-ia',
              title: 'Plano Premium IA - ReservasClub',
              quantity: 1,
              unit_price: 1900, // Valor total de R$ 1.900,00
              description: 'Automação de WhatsApp e IA para Reservas',
            },
          ],
          external_reference: `PREMIUM_UPGRADE:${nightclubId}`,
          notification_url: `https://reservas-backend-fa4b.onrender.com/payments/webhook`,
          back_urls: {
            success: `${this.configService.get('FRONTEND_URL')}/dashboard/ai?status=success`,
            failure: `${this.configService.get('FRONTEND_URL')}/dashboard/ai?status=error`,
          },
          auto_return: 'approved',
          payment_methods: {
            installments: 12, // Permite parcelamento em até 12x
          },
        },
      });

      return { initPoint: response.init_point };
    } catch (error: any) {
      console.error('❌ ERRO AO CRIAR PREFERÊNCIA:', error.message);
      throw new BadRequestException(
        'Erro ao gerar link de pagamento do plano.',
      );
    }
  }

  // ===========================================================================
  // 4. WEBHOOK (RESERVAS + PLANO PREMIUM)
  // ===========================================================================
  async processWebhook(paymentId: string) {
    // 1. Primeiro, tentamos ver se é um pagamento de plano (usando o token da plataforma)
    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');
    const platformClient = new MercadoPagoConfig({
      accessToken: platformToken,
    });
    const payment = new Payment(platformClient);

    try {
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status !== 'approved') return;

      const externalRef = paymentData.external_reference;

      // VERIFICAÇÃO: É UM UPGRADE DE PLANO?
      if (externalRef && externalRef.startsWith('PREMIUM_UPGRADE:')) {
        const nightclubId = externalRef.split(':')[1];

        await this.prisma.nightclub.update({
          where: { id: nightclubId },
          data: {
            plan: 'PREMIUM',
            planExpiresAt: addYears(new Date(), 1), // Plano válido por 1 ano
          },
        });

        console.log(`✨ [WEBHOOK] Balada ${nightclubId} agora é PREMIUM!`);
        return;
      }

      // SE NÃO FOR PLANO, PROSSEGUE PARA LÓGICA DE RESERVA
      const reservation = await this.prisma.reservation.findFirst({
        where: {
          paymentId: paymentId.toString(),
          status: { in: ['PENDING', 'CANCELED'] },
        },
        include: { nightclub: true },
      });

      if (!reservation) {
        // Se não achou com o token da plataforma, pode ser de um token direto da balada
        // Aqui você já tem a lógica de busca do token da balada no seu código original
        // Vamos manter a compatibilidade com sua lógica existente:
        this.handleReservationPayment(paymentId);
        return;
      }

      // Lógica de confirmação da reserva (mesma do seu código)
      await this.confirmReservation(reservation.id, paymentId);
    } catch (error: any) {
      console.error('❌ Erro no processamento do Webhook:', error.message);
    }
  }

  // Métodos auxiliares para manter o processWebhook limpo
  private async handleReservationPayment(paymentId: string) {
    // Busca a reserva para pegar o token correto
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation) return;

    const rawToken = reservation.nightclub.mpAccessToken;
    const activeAccessToken =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || this.configService.get('MP_PLATFORM_ACCESS_TOKEN');

    const client = new MercadoPagoConfig({ accessToken: activeAccessToken });
    const payment = new Payment(client);

    const data = await payment.get({ id: paymentId });
    if (data.status === 'approved') {
      await this.confirmReservation(reservation.id, paymentId);
    }
  }

  private async confirmReservation(reservationId: string, paymentId: string) {
    const validationToken = uuidv4();
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CONFIRMED',
        validationToken,
      },
      include: { space: true, nightclub: true },
    });

    console.log(`✅ [WEBHOOK] Reserva ${updated.id} confirmada.`);

    if (updated.customerEmail) {
      await this.mailService
        .sendReservationConfirmation(updated as any, updated.nightclub.name)
        .catch((err) => console.error('Erro e-mail:', err.message));
    }

    await this.notificationsService
      .notifyNewReservation(updated.nightclubId, {
        id: updated.id,
        customerName: updated.customerName,
        spaceName: updated.space.name,
      })
      .catch((err) => console.error('Erro Push:', err.message));
  }
}
