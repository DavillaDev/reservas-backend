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

    if (
      reservation.paymentDeadline &&
      reservation.paymentDeadline < new Date() &&
      reservation.status === 'PENDING'
    ) {
      await this.prisma.reservation.update({
        where: { id },
        data: { status: 'CANCELED' },
      });
      throw new ConflictException('O prazo para pagamento expirou.');
    }

    if (
      reservation.status === 'CONFIRMED' ||
      reservation.status === 'COMPLETED'
    ) {
      return { status: 'PAID', reservation };
    }

    const pixData = await this.generatePix(id);
    return { status: 'PENDING', reservation, pix: pixData };
  }

  // ===========================================================================
  // 4. GERAR PIX (COM LÓGICA DE SPLIT E WEBHOOK SEGURO)
  // ===========================================================================
  async generatePix(reservationId: string) {
    console.log('================ PIX FLOW START ================');
    console.log('🔎 Reservation ID:', reservationId);

    // =========================================================
    // 1️⃣ BUSCAR RESERVA
    // =========================================================
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) {
      console.error('❌ Reserva não encontrada');
      throw new NotFoundException('Reserva não encontrada');
    }

    console.log('✅ Reserva encontrada:', {
      id: reservation.id,
      nightclub: reservation.nightclub.name,
      space: reservation.space?.name,
    });

    // =========================================================
    // 2️⃣ VALORES E SETTINGS
    // =========================================================
    const settings = (reservation.nightclub.settings as any) || {};
    const amount = Number(reservation.amount || reservation.space?.price || 0);

    console.log('💰 Valor calculado:', amount);

    if (!amount || amount <= 0) {
      console.error('❌ Valor inválido para PIX');
      throw new BadRequestException('Valor inválido para pagamento');
    }

    // =========================================================
    // 3️⃣ DEFINIÇÃO DO TOKEN
    // =========================================================
    const platformToken = this.configService.get<string>(
      'MP_PLATFORM_ACCESS_TOKEN',
    );
    const nightclubToken = settings.mpAccessToken;

    const activeToken = nightclubToken || platformToken;

    console.log('🔑 Token selecionado:', {
      origem: nightclubToken ? 'CONTA DA BALADA (OAuth)' : 'PLATAFORMA',
      existeTokenBalada: !!nightclubToken,
      existeTokenPlataforma: !!platformToken,
    });

    if (!activeToken) {
      console.error('❌ Nenhum token disponível');
      throw new BadRequestException('Token de pagamento não configurado');
    }

    // =========================================================
    // 4️⃣ IDENTIDADE REAL DO TOKEN (PROVA ABSOLUTA)
    // =========================================================
    let mpUser: any;

    try {
      const me = await fetch('https://api.mercadopago.com/users/me', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      mpUser = await me.json();

      console.log('🧠 MP USERS/ME:', {
        id: mpUser.id,
        email: mpUser.email,
        site_id: mpUser.site_id,
        type: mpUser.type,
      });
    } catch (err) {
      console.error('❌ Falha ao validar token no /users/me', err);
      throw new BadRequestException('Token Mercado Pago inválido');
    }

    // =========================================================
    // 5️⃣ CLIENTE MP
    // =========================================================
    const client = new MercadoPagoConfig({
      accessToken: activeToken,
    });

    const payment = new Payment(client);
    const expiresAtDate = addMinutes(new Date(), 15);

    console.log('⏰ Expiração PIX:', expiresAtDate.toISOString());

    // =========================================================
    // 6️⃣ PAYLOAD DO PAGAMENTO (EXPLÍCITO)
    // =========================================================
    const paymentBody: any = {
      transaction_amount: amount,
      description: `Reserva: ${reservation.nightclub.name} - ${reservation.space?.name}`,
      payment_method_id: 'pix',

      payer: {
        email: reservation.customerEmail || 'cliente@email.com',
        first_name: reservation.customerName?.split(' ')[0] || 'Cliente',
        entity_type: 'individual',
      },

      notification_url:
        'https://reservas-backend-fa4b.onrender.com/reservations/webhook',

      date_of_expiration: expiresAtDate.toISOString(),
      external_reference: reservation.id,

      // 🔒 MARKETPLACE BLINDADO
      application_fee: 0,
    };

    console.log('📦 Payment Body FINAL:', JSON.stringify(paymentBody, null, 2));

    // =========================================================
    // 7️⃣ CRIAÇÃO DO PIX
    // =========================================================
    try {
      console.log('🚀 Enviando request para Mercado Pago...');

      const response = await payment.create({ body: paymentBody });

      console.log('✅ PIX CRIADO COM SUCESSO:', {
        paymentId: response.id,
        status: response.status,
        qrGerado: !!response.point_of_interaction?.transaction_data?.qr_code,
      });

      // =========================================================
      // 8️⃣ ATUALIZA RESERVA
      // =========================================================
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          paymentId: response.id?.toString(),
          paymentDeadline: expiresAtDate,
          status: 'PENDING',
        },
      });

      console.log('💾 Reserva atualizada com pagamento');

      return {
        qrCodeBase64:
          response.point_of_interaction?.transaction_data?.qr_code_base64,
        pixCode: response.point_of_interaction?.transaction_data?.qr_code,
        paymentId: response.id,
        amount,
        expiresAt: expiresAtDate,
      };
    } catch (error: any) {
      console.error('❌ ERRO MERCADO PAGO — PAYMENTS CREATE');
      console.error('📛 STATUS:', error?.status);
      console.error('📛 MESSAGE:', error?.message);
      console.error(
        '📛 RESPONSE DATA:',
        JSON.stringify(error?.response?.data, null, 2),
      );

      throw new BadRequestException(
        'Erro ao gerar PIX. Verifique a conta Mercado Pago conectada.',
      );
    } finally {
      console.log('================ PIX FLOW END ==================');
    }
  }

  // Função auxiliar para não repetir código
  private async handleMpResponse(
    response: any,
    reservationId: string,
    expiresAt: Date,
    amount: number,
  ) {
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        paymentId: response.id?.toString(),
        paymentDeadline: expiresAt,
        status: 'PENDING',
      },
    });

    return {
      qrCodeBase64:
        response.point_of_interaction?.transaction_data?.qr_code_base64,
      pixCode: response.point_of_interaction?.transaction_data?.qr_code,
      paymentId: response.id,
      amount,
      expiresAt,
    };
  }

  // ===========================================================================
  // 5. WEBHOOK (PROCESSAMENTO EM BACKGROUND)
  // ===========================================================================
  async processWebhook(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation || reservation.status === 'CONFIRMED') return;

    const settings = (reservation.nightclub.settings as any) || {};
    const platformAccessToken = this.configService.get(
      'MP_PLATFORM_ACCESS_TOKEN',
    );

    // Webhook deve consultar usando o token que gerou o pagamento
    const activeAccessToken = settings.mpAccessToken || platformAccessToken;

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
          include: { space: true, nightclub: true },
        });

        if (updated.customerEmail) {
          await this.mailService.sendReservationConfirmation(
            updated as any,
            updated.nightclub.name,
          );
        }
        console.log(`✅ Pagamento aprovado para reserva ${reservation.id}`);
      }
    } catch (error) {
      console.error('Erro ao processar Webhook:', error.message);
    }
  }

  // ===========================================================================
  // 6. VALIDAÇÃO, CHECK-IN E CRUD
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

  async forceApproveSimulation(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { space: true, nightclub: true },
    });

    if (!reservation) return null;

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

    return updated;
  }
}
