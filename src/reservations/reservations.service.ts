import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { addMinutes, isAfter } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  // ===========================================================================
  // 1. CRIAR RESERVA (AGORA COM TRAVA DE DIAS DE FUNCIONAMENTO 🔒)
  // ===========================================================================
  async create(dto: CreateReservationDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });

    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id: dto.nightclubId },
      select: { id: true, name: true, settings: true },
    });

    if (!space || !nightclub) {
      throw new NotFoundException('Balada ou espaço não encontrados.');
    }

    // 🐛 CORREÇÃO DE DATA (BUG DO FUSO HORÁRIO):
    const safeDateString = dto.date.includes('T')
      ? dto.date
      : `${dto.date}T12:00:00.000Z`;

    const checkDate = new Date(safeDateString);

    // =========================================================================
    // 🔒 NOVA VERIFICAÇÃO: DIAS DE FUNCIONAMENTO
    // =========================================================================
    const settings = (nightclub.settings as any) || {};
    const openingDays = settings.openingDays as number[]; // Ex: [5, 6] para Sex e Sab

    // Se 'openingDays' existir e tiver dados, verificamos
    if (openingDays && openingDays.length > 0) {
      const dayOfWeek = checkDate.getDay(); // 0 (Dom) a 6 (Sáb)

      if (!openingDays.includes(dayOfWeek)) {
        // Mapeia para nome amigável só para a mensagem de erro
        const dayNames = [
          'Domingo',
          'Segunda',
          'Terça',
          'Quarta',
          'Quinta',
          'Sexta',
          'Sábado',
        ];
        throw new BadRequestException(
          `A casa não abre neste dia (${dayNames[dayOfWeek]}). Dias disponíveis: ${openingDays.map((d) => dayNames[d]).join(', ')}.`,
        );
      }
    }
    // =========================================================================

    // Para verificar conflito, olhamos o dia inteiro (range 00:00 até 23:59)
    const startOfDay = new Date(safeDateString);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(safeDateString);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingReservation = await this.prisma.reservation.findFirst({
      where: {
        spaceId: dto.spaceId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { not: 'CANCELED' },
      },
    });

    if (existingReservation) {
      throw new ConflictException(
        'Este espaço já está reservado para esta data.',
      );
    }

    const price = Number(space.price || 0);

    // Configurações de pagamento
    const paymentActive = settings?.payment_active !== false;
    const requiresPayment = price > 0 && paymentActive;

    const initialStatus = requiresPayment ? 'PENDING' : 'CONFIRMED';
    const paymentDeadline = requiresPayment ? addMinutes(new Date(), 20) : null;
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
        birthdayDate: dto.birthdayDate ? new Date(dto.birthdayDate) : null,
        status: initialStatus,
        amount: price,
        paymentDeadline,
        validationToken,
      },
    });

    if (!requiresPayment && reservation.customerEmail) {
      const fullRes = await this.prisma.reservation.findUnique({
        where: { id: reservation.id },
        include: { space: true, nightclub: true },
      });
      if (fullRes) {
        await this.mailService.sendReservationConfirmation(
          fullRes as any,
          nightclub.name,
        );
      }
    }

    return {
      ...reservation,
      action: requiresPayment ? 'REDIRECT_CHECKOUT' : 'SHOW_CONFIRMATION',
    };
  }

  // ===========================================================================
  // 2. LISTAR RESERVAS
  // ===========================================================================
  async findAll(date?: string, nightclubId?: string) {
    const where: any = {};
    if (nightclubId) where.nightclubId = nightclubId;

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);

      where.date = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

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

    if (
      reservation.status === 'CONFIRMED' ||
      (reservation.status as string) === 'CHECKED_IN'
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
  // 4. GERAR OU RECUPERAR PIX
  // ===========================================================================
  async generatePix(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) {
      throw new NotFoundException(
        'Reserva não encontrada para gerar o pagamento.',
      );
    }

    const settings = (reservation.nightclub.settings as any) || {};
    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');

    const accessTokenParaUsar = settings.mpAccessToken || platformToken;

    const client = new MercadoPagoConfig({ accessToken: accessTokenParaUsar });
    const payment = new Payment(client);

    try {
      if (
        reservation.paymentId &&
        reservation.paymentDeadline &&
        new Date(reservation.paymentDeadline) > new Date()
      ) {
        try {
          const existing = await payment.get({ id: reservation.paymentId });
          if (existing.status === 'pending') {
            console.log(
              `[MP_RECOVERY] Reaproveitando PIX ativo: ${reservation.paymentId}`,
            );
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
            `[MP_RECOVERY_WARN] Falha ao recuperar, gerando novo...`,
          );
        }
      }

      const expiresAtDate = addMinutes(new Date(), 20);
      const amount = Number(reservation.amount || reservation.space.price || 0);

      const paymentBody: any = {
        transaction_amount: amount,
        description: `Reserva: ${reservation.nightclub.name} - ${reservation.space.name}`,
        payment_method_id: 'pix',
        payer: {
          email: reservation.customerEmail || 'cliente@email.com',
          first_name: reservation.customerName.split(' ')[0],
        },
        notification_url: `https://reservas-backend-fa4b.onrender.com/reservations/webhook`,
        date_of_expiration: expiresAtDate.toISOString(),
        external_reference: reservation.id,
      };

      console.log(
        `[MP_FLOW] Gerando PIX via token: ${settings.mpAccessToken ? 'DA BALADA' : 'DA PLATAFORMA'}`,
      );

      const response = await payment.create({ body: paymentBody });

      console.log(
        `[MP_SUCCESS] Collector ID Recebedor: ${response.collector_id}`,
      );

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
      console.error(
        '❌ ERRO MERCADO PAGO:',
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        'Erro ao processar pagamento. Tente novamente mais tarde.',
      );
    }
  }

  // ===========================================================================
  // 5. WEBHOOK
  // ===========================================================================
  async processWebhook(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation || reservation.status === 'CONFIRMED') return;

    const settings = (reservation.nightclub.settings as any) || {};
    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');
    const activeAccessToken = settings.mpAccessToken || platformToken;

    const client = new MercadoPagoConfig({ accessToken: activeAccessToken });
    const payment = new Payment(client);

    try {
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status === 'approved') {
        const validationToken = uuidv4();

        const updated = await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: {
            status: 'CONFIRMED',
            validationToken,
          },
          include: {
            space: true,
            nightclub: true,
          },
        });

        if (updated.customerEmail) {
          await this.mailService
            .sendReservationConfirmation(updated as any, updated.nightclub.name)
            .catch((err) => console.error('Erro e-mail:', err.message));
        }
      }
    } catch (error: any) {
      console.error('Erro Webhook:', error.message);
    }
  }

  // ===========================================================================
  // 6. CHECK-IN
  // ===========================================================================
  async checkInByToken(token: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { validationToken: token },
    });

    if (!reservation) throw new NotFoundException('Token inválido.');
    if (reservation.status === 'CHECKED_IN')
      throw new ConflictException('Já foi validado.');

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CHECKED_IN', checkInAt: new Date() },
      include: {
        space: true,
        nightclub: true,
      },
    });
  }

  // ===========================================================================
  // 7. CRON JOB
  // ===========================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const now = new Date();

    console.log(
      `[CRON] 🕒 Verificando expiração em: ${now.toISOString()} (UTC)`,
    );

    const totalPending = await this.prisma.reservation.count({
      where: { status: 'PENDING' },
    });

    const expiredCount = await this.prisma.reservation.count({
      where: {
        status: 'PENDING',
        paymentDeadline: { lt: now },
      },
    });

    console.log(
      `[CRON] 📊 Diagnóstico: ${totalPending} pendentes no total. ${expiredCount} já venceram.`,
    );

    if (expiredCount > 0) {
      const result = await this.prisma.reservation.updateMany({
        where: {
          status: 'PENDING',
          paymentDeadline: {
            lt: now,
          },
        },
        data: {
          status: 'CANCELED',
        },
      });

      console.log(
        `[CRON] 🧹 LIXEIRA: ${result.count} reservas expiradas foram canceladas agora.`,
      );
    }
  }

  findOne(id: string) {
    return this.prisma.reservation.findUnique({
      where: { id },
      include: { space: true, nightclub: true },
    });
  }

  update(id: string, dto: UpdateReservationDto) {
    return this.prisma.reservation.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.reservation.delete({ where: { id } });
  }
}
