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
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { nightclub: true, space: true },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada');

    const settings = (reservation.nightclub.settings as any) || {};
    const amount = Number(reservation.amount || reservation.space.price || 0);

    // 🔑 O Token deve ser o da PLATAFORMA para operar como Marketplace
    const platformAccessToken = this.configService.get(
      'MP_PLATFORM_ACCESS_TOKEN',
    );

    if (!platformAccessToken) {
      throw new BadRequestException(
        'Token de plataforma não configurado no Render.',
      );
    }

    const client = new MercadoPagoConfig({ accessToken: platformAccessToken });
    const payment = new Payment(client);
    const expiresAtDate = addMinutes(new Date(), 15);

    try {
      // Cálculo da Taxa (Application Fee)
      const appFeePercent = Number(settings?.appFeePercent || 0);
      let applicationFee = 0;
      if (appFeePercent > 0) {
        applicationFee = parseFloat(
          ((amount * appFeePercent) / 100).toFixed(2),
        );
      }

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

      // 🛡️ DEFINIÇÃO DO HEADER DE SPLIT
      const requestOptions: any = {};

      if (settings.mpAccountId) {
        // O dinheiro vai para a balada, e você retém a application_fee
        if (applicationFee > 0) {
          paymentBody.application_fee = applicationFee;
        }

        // CORREÇÃO: A SDK v2 espera 'headers' dentro de requestOptions
        requestOptions.headers = {
          'X-Target-App-Id': settings.mpAccountId.toString(),
        };

        console.log(
          `💰 [SPLIT] Criando pagamento para conta: ${settings.mpAccountId} com taxa de R$ ${applicationFee}`,
        );
      }

      const response = await payment.create({
        body: paymentBody,
        ...requestOptions, // Espalha headers se existirem
      });

      // Salva os dados do pagamento no banco
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
        '❌ ERRO NO MERCADO PAGO:',
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        'Erro ao gerar PIX. Verifique as permissões da conta vinculada.',
      );
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
