import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { addMinutes } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService, // 🚨 CORREÇÃO: 'private' adicionado para corrigir erro TS
  ) {}

  // ===========================================================================
  // 1. CRIAR RESERVA
  // ===========================================================================
  async create(dto: CreateReservationDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });

    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id: dto.nightclubId },
      select: { id: true, name: true, settings: true, appFeePercent: true },
    });

    if (!space || !nightclub) {
      throw new NotFoundException('Balada ou espaço não encontrados.');
    }

    // Validação de Data
    const checkDate = new Date(dto.date);
    const existingReservation = await this.prisma.reservation.findFirst({
      where: {
        spaceId: dto.spaceId,
        date: checkDate,
        status: { not: 'CANCELED' }, // 🚨 CORREÇÃO: Status correto 'CANCELED'
      },
    });

    if (existingReservation) {
      throw new ConflictException(
        'Este espaço já está reservado para esta data.',
      );
    }

    const price = Number(space.price || 0);
    const settings = nightclub.settings as any;

    const paymentActive = settings?.payment_active !== false;
    const requiresPayment = price > 0 && paymentActive;

    const birthdayDate = dto.birthdayDate ? new Date(dto.birthdayDate) : null;
    const initialStatus = requiresPayment ? 'PENDING' : 'CONFIRMED';

    const paymentDeadline = requiresPayment ? addMinutes(new Date(), 15) : null;
    const validationToken = !requiresPayment ? uuidv4() : null;

    const reservation = await this.prisma.reservation.create({
      data: {
        nightclubId: dto.nightclubId,
        spaceId: dto.spaceId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        date: checkDate,
        notes: dto.notes,
        isBirthday: dto.isBirthday || false,
        birthdayDate: birthdayDate,
        status: initialStatus,
        amount: price,
        paymentDeadline: paymentDeadline,
        validationToken: validationToken,
      },
    });

    // Envia email se for grátis (Simulação)
    if (!requiresPayment && reservation.customerEmail) {
      const fullRes = await this.prisma.reservation.findUnique({
        where: { id: reservation.id },
        include: { space: true, nightclub: true },
      });
      if (fullRes) {
        // Cast 'as any' usado temporariamente pois o MailService foi simplificado
        await this.mailService.sendReservationConfirmation(
          fullRes as any,
          nightclub.name,
        );
      }
    }

    return {
      ...reservation,
      action: requiresPayment ? 'REDIRECT_CHECKOUT' : 'SHOW_CONFIRMATION',
      amount: price,
      spaceName: space.name,
      paymentDeadline: paymentDeadline,
    };
  }

  // ===========================================================================
  // 2. LISTAR RESERVAS
  // ===========================================================================
  async findAll(date?: string, nightclubId?: string) {
    const where: any = {};

    if (nightclubId) where.nightclubId = nightclubId;
    if (date) where.date = new Date(date);

    return this.prisma.reservation.findMany({
      where,
      include: { space: true, nightclub: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 3. CHECKOUT
  // ===========================================================================
  async getCheckoutData(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada.');

    // Verifica se o prazo de pagamento expirou
    if (
      reservation.paymentDeadline &&
      reservation.paymentDeadline < new Date()
    ) {
      await this.prisma.reservation.update({
        where: { id },
        data: { status: 'CANCELED' }, // 🚨 CORREÇÃO: Status correto
      });
      throw new ConflictException(
        'O prazo para pagamento desta reserva expirou. Tente novamente.',
      );
    }

    if (reservation.status === 'CONFIRMED') {
      return { status: 'PAID', reservation, pix: null };
    }

    // Gera ou recupera o PIX
    const pixData = await this.generatePix(id);

    return { status: 'PENDING', reservation, pix: pixData };
  }

  // ===========================================================================
  // 4. CRUD BÁSICO
  // ===========================================================================
  findOne(id: string) {
    return this.prisma.reservation.findUnique({
      where: { id },
      include: { space: true, nightclub: true },
    });
  }

  update(id: string, updateReservationDto: UpdateReservationDto) {
    return this.prisma.reservation.update({
      where: { id },
      data: updateReservationDto,
    });
  }

  remove(id: string) {
    return this.prisma.reservation.delete({ where: { id } });
  }

  // ===========================================================================
  // 5. GERAR PIX (🚨 MOR IMPLEMENTADO)
  // ===========================================================================
  async generatePix(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada');

    if (
      reservation.paymentDeadline &&
      reservation.paymentDeadline < new Date()
    ) {
      throw new ConflictException(
        'O prazo de pagamento desta reserva expirou. Crie uma nova.',
      );
    }

    // 🚨 CHAVE CRÍTICA: USANDO O TOKEN DA PLATAFORMA (MOR)
    const platformAccessToken = this.configService.get(
      'MP_PLATFORM_ACCESS_TOKEN',
    );

    if (!platformAccessToken) {
      throw new BadRequestException(
        'O SaaS não configurou o token de Plataforma.',
      );
    }

    const amount = Number(reservation.amount || reservation.space.price || 0);

    // 💰 CÁLCULO DA TAXA SaaS (Apenas Log)
    const saasFeePercent = Number(
      this.configService.get('SAAS_FEE_PERCENT') || 5,
    );
    const saasFeeAmount = parseFloat(
      ((amount * saasFeePercent) / 100).toFixed(2),
    );
    const netRepassAmount = parseFloat((amount - saasFeeAmount).toFixed(2));

    console.log(`💰 Processando Pagamento (MOR): R$ ${amount}`);
    console.log(
      `📉 Taxa SaaS: R$ ${saasFeeAmount}. Repasse Líquido: R$ ${netRepassAmount}`,
    );

    const client = new MercadoPagoConfig({ accessToken: platformAccessToken });
    const payment = new Payment(client);

    const baseUrl =
      this.configService.get('API_BASE_URL') || 'http://localhost:3000';
    const notificationUrl = `${baseUrl}/reservations/webhook`;

    const expiresAtDate = addMinutes(new Date(), 15);

    try {
      if (reservation.paymentId) {
        try {
          const existingPayment = await payment.get({
            id: reservation.paymentId,
          });
          if (existingPayment.status === 'pending') {
            return {
              qrCodeBase64:
                existingPayment.point_of_interaction?.transaction_data
                  ?.qr_code_base64,
              pixCode:
                existingPayment.point_of_interaction?.transaction_data?.qr_code,
              paymentId: existingPayment.id,
              amount,
              expiresAt: reservation.paymentDeadline || expiresAtDate,
            };
          }
        } catch (e) {
          // Gera novo se falhar
        }
      }

      const response = await payment.create({
        body: {
          transaction_amount: amount,
          description: `Reserva ${reservation.nightclub.name} - ${reservation.space.name}`,
          payment_method_id: 'pix',
          payer: {
            email: reservation.customerEmail || 'cliente@email.com',
            first_name: reservation.customerName.split(' ')[0],
          },
          notification_url: notificationUrl,
          date_of_expiration: expiresAtDate.toISOString(),
          // Sem application_fee/external_reference (MOR)
        },
      });

      if (!response.id) throw new Error('Mercado Pago não retornou ID.');

      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          paymentId: response.id.toString(),
          paymentCreatedAt: new Date(),
          status: 'PENDING',
          paymentDeadline: expiresAtDate,
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
      console.error('Erro Mercado Pago na Plataforma (MOR):', error);
      throw new BadRequestException(
        error.message || 'Erro ao gerar pagamento PIX (Plataforma MOR).',
      );
    }
  }

  // ===========================================================================
  // 6. WEBHOOK (ATUALIZADO PARA MOR)
  // ===========================================================================
  async processWebhook(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation || reservation.status === 'CONFIRMED') return;

    // 🚨 CORREÇÃO: No modelo MOR, o pagamento está na conta da PLATAFORMA
    // Devemos usar o token da plataforma para consultar, não o do cliente.
    const platformAccessToken = this.configService.get(
      'MP_PLATFORM_ACCESS_TOKEN',
    );
    if (!platformAccessToken) return;

    const client = new MercadoPagoConfig({ accessToken: platformAccessToken });
    const payment = new Payment(client);

    try {
      const paymentData = await payment.get({ id: paymentId });
      if (paymentData.status === 'approved') {
        const validationToken = uuidv4();

        await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: {
            status: 'CONFIRMED',
            validationToken: validationToken,
          },
        });

        console.log(
          `✅ Reserva ${reservation.id} confirmada e paga! Token: ${validationToken}`,
        );

        if (reservation.customerEmail) {
          const confirmedReservation = await this.prisma.reservation.findUnique(
            {
              where: { id: reservation.id },
              include: { space: true, nightclub: true },
            },
          );

          if (confirmedReservation) {
            await this.mailService.sendReservationConfirmation(
              confirmedReservation as any,
              confirmedReservation.nightclub.name,
            );
          }
        }
      }
    } catch (error) {
      console.error('Erro ao consultar status no MP:', error);
    }
  }

  // ===========================================================================
  // 7. VALIDAÇÃO DE PORTARIA
  // ===========================================================================
  async checkInByToken(token: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { validationToken: token },
      include: { nightclub: true, space: true },
    });

    if (!reservation) {
      throw new NotFoundException('Token de validação inválido.');
    }

    if (reservation.status === 'CHECKED_IN') {
      throw new ConflictException('Esta reserva já foi validada na portaria.');
    }

    if (reservation.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Status inválido: A reserva está ${reservation.status}.`,
      );
    }

    const checkedInReservation = await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CHECKED_IN', checkInAt: new Date() },
      include: { nightclub: true, space: true },
    });

    return checkedInReservation;
  }

  // ===========================================================================
  // 8. SIMULAÇÃO (ATUALIZADO)
  // ===========================================================================
  async forceApproveSimulation(paymentId: string) {
    console.log('🧪 Simulando aprovação:', paymentId);
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (reservation) {
      const validationToken = uuidv4();

      // 🚨 CORREÇÃO: Atualiza e salva o objeto retornado
      const confirmedReservation = await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'CONFIRMED',
          validationToken: validationToken,
        },
        include: { space: true, nightclub: true }, // Include necessário para o retorno
      });

      if (reservation.customerEmail) {
        // Envia email simulado
        await this.mailService.sendReservationConfirmation(
          confirmedReservation as any,
          confirmedReservation.nightclub.name,
        );
      }

      // 🚨 IMPORTANTE: Retorna a reserva completa para o Controller exibir o token
      return confirmedReservation;
    }
    return null;
  }
}
