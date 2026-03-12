import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { addMinutes, addYears, isAfter } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '../common/utils/encryption.util';
import axios from 'axios';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  // 🛡️ MOTOR DE RESILIÊNCIA: Tenta de novo se a rede falhar
  private async withRetry<T>(operation: () => any, maxRetries = 3): Promise<T> {
    let attempt = 1;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        // Se for erro de validação (400 a 499, exceto 429 Rate Limit), não tenta de novo
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }

        if (attempt === maxRetries) {
          this.logger.error(`❌ Todas as ${maxRetries} tentativas falharam.`);
          throw error;
        }

        const delay = attempt * 1000; // Exponential backoff simples: 1s, 2s, 3s...
        this.logger.warn(
          `⚠️ Falha na API externa. Tentativa ${attempt}/${maxRetries}. Retentando em ${delay}ms...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        attempt++;
      }
    }
    throw new Error('Falha inesperada no motor de retry.');
  }

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
        where: { id: id },
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

    const platformToken =
      this.configService.get<string>('MP_PLATFORM_ACCESS_TOKEN') || '';
    const rawToken = reservation.nightclub.mpAccessToken;

    const accessTokenParaUsar =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || platformToken;

    if (!accessTokenParaUsar) {
      throw new InternalServerErrorException(
        'Token do Mercado Pago não configurado.',
      );
    }

    const client = new MercadoPagoConfig({ accessToken: accessTokenParaUsar });
    const payment = new Payment(client);

    try {
      if (
        reservation.paymentId &&
        reservation.paymentDeadline &&
        new Date(reservation.paymentDeadline) > new Date()
      ) {
        try {
          // 🛡️ Recuperação blindada com tipagem flexível
          const existing: any = await this.withRetry(() =>
            payment.get({ id: reservation.paymentId as string }),
          );

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
          this.logger.warn(
            `[MP_RECOVERY_WARN] Erro ao recuperar ${reservation.paymentId}`,
          );
        }
      }

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

      let response: any; // 🛡️ Tipagem ajustada
      try {
        // 🛡️ Criação de pagamento blindada
        response = await this.withRetry(() =>
          payment.create({ body: paymentBody }),
        );
      } catch (mpError: any) {
        const errorData = mpError.response?.data || {};
        const errorMsg = errorData.message || mpError.message || '';

        if (errorMsg.includes('application_fee')) {
          delete paymentBody.application_fee;
          response = await this.withRetry(() =>
            payment.create({ body: paymentBody }),
          );
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
        throw new BadRequestException('Muitas requisições. Aguarde.');
      }
      this.logger.error(
        '❌ ERRO MERCADO PAGO:',
        error.response?.data || error.message,
      );
      throw new BadRequestException('Erro ao processar pagamento.');
    }
  }

  // ===========================================================================
  // 3. UPGRADE PREMIUM (SaaS Planos)
  // ===========================================================================
  async createPremiumPreference(nightclubId: string) {
    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id: nightclubId },
    });

    if (!nightclub) throw new NotFoundException('Balada não encontrada.');

    const platformToken = this.configService.get<string>(
      'MP_PLATFORM_ACCESS_TOKEN',
    );
    if (!platformToken)
      throw new InternalServerErrorException(
        'MP_PLATFORM_ACCESS_TOKEN ausente.',
      );

    const client = new MercadoPagoConfig({ accessToken: platformToken });
    const preference = new Preference(client);

    try {
      // 🛡️ Geração de link blindada
      const response: any = await this.withRetry(() =>
        preference.create({
          body: {
            items: [
              {
                id: 'premium-plan-ia',
                title: 'Plano Premium IA - ReservasClub',
                quantity: 1,
                unit_price: 1900,
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
            payment_methods: { installments: 12 },
          },
        }),
      );
      return { initPoint: response.init_point };
    } catch (error: any) {
      throw new BadRequestException('Erro ao gerar link de pagamento.');
    }
  }

  // ===========================================================================
  // 4. WEBHOOK (RESERVAS + PLANO PREMIUM)
  // ===========================================================================
  async processWebhook(paymentId: string) {
    const platformToken =
      this.configService.get<string>('MP_PLATFORM_ACCESS_TOKEN') || '';
    const platformClient = new MercadoPagoConfig({
      accessToken: platformToken,
    });
    const payment = new Payment(platformClient);

    try {
      // 🛡️ Leitura do Webhook blindada
      const paymentData: any = await this.withRetry(() =>
        payment.get({ id: paymentId }),
      );
      if (paymentData.status !== 'approved') return;

      const externalRef = paymentData.external_reference;

      if (externalRef && externalRef.startsWith('PREMIUM_UPGRADE:')) {
        const nightclubId = externalRef.split(':')[1];
        await this.prisma.nightclub.update({
          where: { id: nightclubId },
          data: { plan: 'PREMIUM', planExpiresAt: addYears(new Date(), 1) },
        });
        this.logger.log(`✨ [WEBHOOK] Balada ${nightclubId} agora é PREMIUM!`);
        return;
      }

      const reservation = await this.prisma.reservation.findFirst({
        where: {
          paymentId: paymentId.toString(),
          status: { in: ['PENDING', 'CANCELED'] },
        },
        include: { nightclub: true },
      });

      if (!reservation) {
        await this.handleReservationPayment(paymentId);
        return;
      }

      await this.confirmReservation(reservation.id, paymentId);
    } catch (error: any) {
      this.logger.error('❌ Erro no Webhook:', error.message);
    }
  }

  private async handleReservationPayment(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation) return;

    const platformToken =
      this.configService.get<string>('MP_PLATFORM_ACCESS_TOKEN') || '';
    const rawToken = reservation.nightclub.mpAccessToken;
    const activeAccessToken =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || platformToken;

    if (!activeAccessToken) return;

    const client = new MercadoPagoConfig({ accessToken: activeAccessToken });
    const payment = new Payment(client);

    try {
      // 🛡️ Leitura do pagamento blindada
      const data: any = await this.withRetry(() =>
        payment.get({ id: paymentId }),
      );
      if (data.status === 'approved') {
        await this.confirmReservation(reservation.id, paymentId);
      }
    } catch (err: any) {
      this.logger.error('[handleReservationPayment] Erro:', err.message);
    }
  }

  // ===========================================================================
  // 5. CONFIRMAÇÃO FINAL (E-MAIL + PUSH + WHATSAPP 🚀)
  // ===========================================================================
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

    this.logger.log(`✅ [WEBHOOK] Reserva ${updated.id} confirmada.`);

    // 1. E-mail
    if (updated.customerEmail) {
      this.mailService
        .sendReservationConfirmation(updated as any, updated.nightclub.name)
        .catch((err) => this.logger.error('Erro e-mail:', err.message));
    }

    // 2. Push Notification (Admin)
    this.notificationsService
      .notifyNewReservation(updated.nightclubId, {
        id: updated.id,
        customerName: updated.customerName,
        spaceName: updated.space.name,
      })
      .catch((err) => this.logger.error('Erro Push:', err.message));

    // 3. 📲 WHATSAPP AUTOMÁTICO (O Ingresso QR Code)
    this.dispararIngressoWhatsapp(updated).catch((err) =>
      this.logger.error('❌ Erro no Ingresso WhatsApp:', err.message),
    );
  }

  private async dispararIngressoWhatsapp(reservation: any) {
    try {
      const serviceIaUrl =
        this.configService.get('SERVICE_IA_URL') || 'http://localhost:10000';
      const internalKey = this.configService.get('INTERNAL_SERVICE_KEY');

      // Puxa a URL do frontend (ou usa o padrão) para montar o link dinâmico
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'https://reservasclub.com';
      const checkoutLink = `${frontendUrl}/checkout/${reservation.id}`;

      // Monta a mensagem enviando o link como sendo o Ingresso Digital
      const mensagem =
        `✅ *PAGAMENTO CONFIRMADO!*\n\n` +
        `Fala *${reservation.customerName.split(' ')[0]}*! Sua reserva na *${reservation.nightclub.name.toUpperCase()}* está garantida.\n\n` +
        `📍 *Setor:* ${reservation.space.name}\n\n` +
        `🎫 *SEU INGRESSO DIGITAL ESTÁ AQUI:*\n` +
        `${checkoutLink}\n\n` +
        `Acesse o link acima para abrir seu QR Code de entrada. Apresente na portaria e boa festa! 🥂`;

      // 🛡️ Envio de mensagem com retry e timeout para não falhar à toa
      await this.withRetry(() =>
        axios.post(
          `${serviceIaUrl}/whatsapp/send-message`,
          {
            nightclubId: reservation.nightclubId,
            number: reservation.customerPhone,
            text: mensagem,
          },
          {
            headers: { 'x-internal-key': internalKey },
            timeout: 5000, // 5s por tentativa
          },
        ),
      );

      this.logger.log(
        `📲 [WhatsApp] Ingresso (Link Checkout) enviado para ${reservation.customerPhone}`,
      );
    } catch (error: any) {
      this.logger.error(
        'Falha ao disparar ingresso automático via WhatsApp:',
        error.message,
      );
    }
  }
}
