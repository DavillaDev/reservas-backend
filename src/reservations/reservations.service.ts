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
import { addMinutes, isAfter } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
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
      select: { id: true, name: true, settings: true },
    });

    if (!space || !nightclub) {
      throw new NotFoundException('Balada ou espaço não encontrados.');
    }

    const checkDate = new Date(dto.date);
    const existingReservation = await this.prisma.reservation.findFirst({
      where: {
        spaceId: dto.spaceId,
        date: checkDate,
        status: { not: 'CANCELED' },
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

    const initialStatus = requiresPayment ? 'PENDING' : 'CONFIRMED';
    // Definimos um deadline inicial de 15 min no ato da criação
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
    if (date) where.date = new Date(date);

    return this.prisma.reservation.findMany({
      where,
      include: { space: true, nightclub: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 3. CHECKOUT (Interface para o Frontend)
  // ===========================================================================
  async getCheckoutData(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada.');

    // Verifica se já está pago
    if (
      reservation.status === 'CONFIRMED' ||
      (reservation.status as string) === 'COMPLETED'
    ) {
      return { status: 'PAID', reservation };
    }

    // Verifica expiração baseada no banco de dados para evitar reset de timer
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
  // 4. GERAR OU RECUPERAR PIX (BLOQUEIA RESET DE TIMER)
  // ===========================================================================
  async generatePix(reservationId: string) {
    console.log(
      `[RESERVATION_START] 🚀 Iniciando processo para ID: ${reservationId}`,
    );

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) {
      console.error(
        `[FATAL_ERROR] ❌ Reserva ${reservationId} não encontrada no banco.`,
      );
      throw new NotFoundException('Reserva não encontrada');
    }

    const settings = (reservation.nightclub.settings as any) || {};
    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');

    console.log(
      `[CONFIG_CHECK] 🔑 Token Plataforma: ${platformToken?.substring(0, 15)}...`,
    );
    console.log(
      `[CONFIG_CHECK] 🎯 ID da Balada (Target): ${settings.mpAccountId || 'NÃO CONFIGURADO'}`,
    );

    const client = new MercadoPagoConfig({ accessToken: platformToken });
    const payment = new Payment(client);

    try {
      // 1. LÓGICA DE RECUPERAÇÃO (TIMER PERSISTENTE)
      if (
        reservation.paymentId &&
        reservation.paymentDeadline &&
        new Date(reservation.paymentDeadline) > new Date()
      ) {
        console.log(
          `[RECOVERY] 🔄 Tentando recuperar pagamento existente: ${reservation.paymentId}`,
        );
        try {
          const existing = await payment.get({ id: reservation.paymentId });
          console.log(
            `[RECOVERY_STATUS] ℹ️ Status atual no MP: ${existing.status}`,
          );

          if (existing.status === 'pending') {
            console.log(
              `[RECOVERY_SUCCESS] ✅ Reaproveitando PIX ativo para evitar reset de timer.`,
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
            `[RECOVERY_FAILED] ⚠️ Erro ao buscar pagamento antigo, gerando novo...`,
            e.message,
          );
        }
      }

      // 2. PREPARAÇÃO DO NOVO PAGAMENTO
      const expiresAtDate = addMinutes(new Date(), 20);
      const amount = Number(reservation.amount || reservation.space.price || 0);
      const appFee = parseFloat(
        ((amount * (settings.appFeePercent || 0)) / 100).toFixed(2),
      );

      console.log(
        `[CALC] 💰 Valor Total: ${amount} | Taxa App (${settings.appFeePercent}%): ${appFee}`,
      );

      const paymentBody: any = {
        transaction_amount: amount,
        description: `Reserva: ${reservation.nightclub.name} - ID: ${reservation.id}`,
        payment_method_id: 'pix',
        payer: {
          email: reservation.customerEmail || 'cliente@email.com',
          first_name: reservation.customerName?.split(' ')[0] || 'Cliente',
        },
        notification_url: `https://reservas-backend-fa4b.onrender.com/reservations/webhook`,
        date_of_expiration: expiresAtDate.toISOString(),
        external_reference: reservation.id,
      };

      const requestOptions: any = {
        headers: {
          'X-Idempotency-Key': `pix-${reservation.id}-${Date.now()}`, // Evita duplicidade
        },
      };

      // 3. APLICAÇÃO DO SPLIT (CRÍTICO)
      if (settings.mpAccountId) {
        console.log(
          `[SPLIT_MODE] 🛠️ Configurando Target-App-Id: ${settings.mpAccountId}`,
        );
        paymentBody.application_fee = appFee > 0 ? appFee : undefined;
        requestOptions.headers['X-Target-App-Id'] =
          settings.mpAccountId.toString();

        console.log(
          `[SPLIT_PAYLOAD] 📝 Headers:`,
          JSON.stringify(requestOptions.headers),
        );
        console.log(`[SPLIT_PAYLOAD] 📝 Fee: ${paymentBody.application_fee}`);
      } else {
        console.warn(
          `[WARNING] ⚠️ mpAccountId ausente. O dinheiro cairá na conta da PLATAFORMA.`,
        );
      }

      console.log(`[MP_REQUEST] 📤 Enviando requisição para o Mercado Pago...`);

      const response = await payment.create({
        body: paymentBody,
        ...requestOptions,
      });

      console.log(`[MP_RESPONSE] 📥 Sucesso! ID Gerado: ${response.id}`);
      console.log(
        `[MP_RESPONSE] 📥 Merchant Account ID (Quem recebe): ${response.collector_id}`,
      );

      // 4. ATUALIZAÇÃO NO BANCO
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          paymentId: response.id?.toString(),
          paymentDeadline: expiresAtDate,
          status: 'PENDING',
        },
      });

      console.log(`[DATABASE_UPDATE] ✅ Reserva atualizada com sucesso.`);

      return {
        qrCodeBase64:
          response.point_of_interaction?.transaction_data?.qr_code_base64,
        pixCode: response.point_of_interaction?.transaction_data?.qr_code,
        paymentId: response.id,
        amount,
        expiresAt: expiresAtDate,
      };
    } catch (error: any) {
      console.error(`[FATAL_ERROR] 🔥 Erro na integração Mercado Pago!`);
      if (error.response?.data) {
        console.error(
          `[MP_ERROR_DETAILS] 📋 Body do Erro:`,
          JSON.stringify(error.response.data, null, 2),
        );
      } else {
        console.error(`[ERROR_MESSAGE] 📋:`, error.message);
      }
      throw new BadRequestException(
        'Falha na comunicação com o provedor de pagamento.',
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

    const activeAccessToken = this.configService.get(
      'MP_PLATFORM_ACCESS_TOKEN',
    );
    const client = new MercadoPagoConfig({ accessToken: activeAccessToken });
    const payment = new Payment(client);

    try {
      const paymentData = await payment.get({ id: paymentId });
      if (paymentData.status === 'approved') {
        const validationToken = uuidv4();
        const updated = await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: 'CONFIRMED', validationToken },
          include: { space: true, nightclub: true },
        });

        if (updated.customerEmail) {
          await this.mailService.sendReservationConfirmation(
            updated as any,
            updated.nightclub.name,
          );
        }
      }
    } catch (error) {
      console.error('Erro ao processar Webhook:', error.message);
    }
  }

  // ===========================================================================
  // 6. CRUD E VALIDAÇÃO
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
    });
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
