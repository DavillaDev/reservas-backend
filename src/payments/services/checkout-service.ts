import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service'; // Ajuste o caminho se necessário
import { ConfigService } from '@nestjs/config';
import { MercadoPagoProvider } from '../providers/mercado-pago.provider';
import { addMinutes, isAfter, addYears } from 'date-fns';
import { decrypt } from '../../common/utils/encryption.util'; // Ajuste o caminho se necessário

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private mercadoPagoProvider: MercadoPagoProvider,
  ) {}

  // ===========================================================================
  // 1. DADOS DO CHECKOUT DA TELA DO CLIENTE
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
  // 2. GERAÇÃO DE PIX COM INTELIGÊNCIA E FALLBACK
  // ===========================================================================
  async generatePix(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada.');

    let nightclubSettings: any = {};
    if (reservation.nightclub.settings) {
      if (typeof reservation.nightclub.settings === 'string') {
        try {
          nightclubSettings = JSON.parse(reservation.nightclub.settings);
        } catch (e) {
          this.logger.error('Erro ao ler settings da balada:', e);
        }
      } else {
        nightclubSettings = reservation.nightclub.settings;
      }
    }

    const rawAppFee =
      reservation.nightclub.appFeePercent || nightclubSettings.appFeePercent;
    const percentage = rawAppFee ? Number(rawAppFee) / 100 : 0.05;

    // 🛑 EXTRAÇÃO DO TOKEN
    const rawToken =
      reservation.nightclub.mpAccessToken || nightclubSettings.mpAccessToken;

    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException(
        'A balada ainda não configurou o Mercado Pago.',
      );
    }

    let accessTokenParaUsar = '';
    try {
      const tokenLimpo = rawToken.trim();
      accessTokenParaUsar = tokenLimpo.includes(':')
        ? decrypt(tokenLimpo).trim()
        : tokenLimpo;
    } catch (error) {
      this.logger.error('Falha ao descriptografar token:', error);
      throw new InternalServerErrorException(
        'Erro nas credenciais de pagamento da balada.',
      );
    }

    if (!accessTokenParaUsar)
      throw new InternalServerErrorException(
        'Token do Mercado Pago resultou vazio.',
      );

    // 🛑 RECUPERAR PIX EXISTENTE (Evita gerar 2 QRCodes para a mesma reserva)
    if (
      reservation.paymentId &&
      reservation.paymentDeadline &&
      new Date(reservation.paymentDeadline) > new Date()
    ) {
      try {
        const existing: any = await this.mercadoPagoProvider.getPaymentStatus(
          accessTokenParaUsar,
          reservation.paymentId,
        );

        if (existing.status === 'approved') return { status: 'PAID' };
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
          `Erro ao recuperar pagamento ${reservation.paymentId}`,
        );
      }
    }

    // 🛑 PREPARAR NOVO PAYLOAD
    const expiresAtDate = addMinutes(new Date(), 20);
    const amount = Number(reservation.amount || reservation.space.price || 0);

    const rawEmail = reservation.customerEmail || '';
    const validEmail =
      typeof rawEmail === 'string' &&
      rawEmail.includes('@') &&
      rawEmail.includes('.')
        ? rawEmail.trim().toLowerCase()
        : `cliente.${reservation.id.substring(0, 8)}@reservasclub.com.br`;

    const myFee = Number((amount * percentage).toFixed(2));
    const envBackendUrl = this.configService.get('BACKEND_URL');

    const paymentBody: any = {
      transaction_amount: amount,
      description: `Reserva: ${reservation.nightclub.name} - ${reservation.space.name}`,
      payment_method_id: 'pix',
      payer: {
        email: validEmail,
        first_name: reservation.customerName?.split(' ')[0] || 'Cliente',
      },
      notification_url: `${envBackendUrl}/payments/webhook`,
      date_of_expiration: expiresAtDate.toISOString(),
      external_reference: reservation.id,
    };

    if (amount > 2) {
      paymentBody.application_fee = myFee;
    }

    // 🛑 CRIAÇÃO DO PIX COM FALLBACK DE SEGURANÇA
    let response: any;
    try {
      // Tenta gerar usando o Provider
      response = await this.mercadoPagoProvider.createPixPayment(
        accessTokenParaUsar,
        paymentBody,
      );
    } catch (mpError: any) {
      const errorData = mpError.response?.data || {};
      const errorMsg = errorData.message || mpError.message || '';
      const statusCode =
        mpError.status || mpError.response?.status || errorData.status;

      // Se o token da balada foi revogado/expirado, engatilha a Conta Master da Plataforma
      if (errorMsg.includes('invalid access token') || statusCode === 401) {
        this.logger.warn(
          `[FALLBACK ATIVADO] Token da balada falhou. Assumindo com MP_PLATFORM_ACCESS_TOKEN...`,
        );

        const platformToken = this.configService.get<string>(
          'MP_PLATFORM_ACCESS_TOKEN',
        );
        if (!platformToken)
          throw new InternalServerErrorException(
            'Token da plataforma não encontrado no .env.',
          );

        // O dinheiro cai na conta Master, remove a taxa para não dar erro
        delete paymentBody.application_fee;

        // Gera o Pix novamente pela conta master
        response = await this.mercadoPagoProvider.createPixPayment(
          platformToken,
          paymentBody,
        );
        this.logger.warn(
          `[FALLBACK SUCESSO] Pix gerado usando a conta da plataforma!`,
        );
      } else {
        throw mpError;
      }
    }

    // 🛑 ATUALIZA O BANCO E RETORNA PRO FRONTEND
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

    try {
      const preferenceBody = {
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
        notification_url: `${this.configService.get('BACKEND_URL')}/payments/webhook`,
        back_urls: {
          success: `${this.configService.get('FRONTEND_URL')}/dashboard/ai?status=success`,
          failure: `${this.configService.get('FRONTEND_URL')}/dashboard/ai?status=error`,
        },
        auto_return: 'approved',
        payment_methods: { installments: 12 },
      };

      const response: any = await this.mercadoPagoProvider.createPreference(
        platformToken,
        preferenceBody,
      );

      return { initPoint: response.init_point };
    } catch (error: any) {
      this.logger.error('Erro ao gerar preference de assinatura:', error);
      throw new BadRequestException('Erro ao gerar link de pagamento.');
    }
  }
}
