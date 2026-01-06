import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException, // 🚨 Mário: Importamos a Exceção de "Proibido"
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
import { decrypt } from '../common/utils/encryption.util';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  // ===========================================================================
  // 1. CRIAR RESERVA (COM BLACKLIST E CRM 🔒)
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

    if (!dto.customerEmail) {
      throw new BadRequestException(
        'O e-mail do cliente é obrigatório para a reserva.',
      );
    }
    if (!dto.customerName) {
      throw new BadRequestException('O nome do cliente é obrigatório.');
    }
    if (!dto.customerPhone) {
      throw new BadRequestException('O telefone do cliente é obrigatório.');
    }

    // =================================================================
    // 🕵️‍♂️ O LEÃO DE CHÁCARA (BLACKLIST & CRM)
    // =================================================================

    // 1. Busca o cliente pelo e-mail (RG Digital)
    let customer = await this.prisma.customer.findUnique({
      where: { email: dto.customerEmail },
    });

    // 2. 🚫 A BARREIRA: Se estiver na Lista Negra, tchau!
    if (customer && customer.isBlocked) {
      throw new ForbiddenException(
        'Sua conta possui restrições administrativas. Por favor, entre em contato com a gerência pelo WhatsApp para regularizar sua situação.',
      );
    }

    // 3. 📝 O CRM: Cadastra ou Atualiza automaticamente
    if (!customer) {
      // Cliente novo? Cria a ficha dele!
      customer = await this.prisma.customer.create({
        data: {
          email: dto.customerEmail,
          name: dto.customerName,
          phone: dto.customerPhone,
          // cpf: dto.cpf (Se você adicionar CPF no DTO depois, descomente aqui)
        },
      });
    } else {
      // Cliente antigo? Atualiza o telefone caso tenha mudado
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: dto.customerName,
          phone: dto.customerPhone,
        },
      });
    }

    // =================================================================
    // 🐛 CORREÇÃO DE DATA E LÓGICA PADRÃO
    // =================================================================
    const safeDateString = dto.date.includes('T')
      ? dto.date
      : `${dto.date}T12:00:00.000Z`;

    const checkDate = new Date(safeDateString);

    // 🔒 VERIFICAÇÃO: DIAS DE FUNCIONAMENTO
    const settings = (nightclub.settings as any) || {};
    const openingDays = settings.openingDays as number[];

    if (openingDays && openingDays.length > 0) {
      const dayOfWeek = checkDate.getDay();
      if (!openingDays.includes(dayOfWeek)) {
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

    const startOfDay = new Date(safeDateString);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(safeDateString);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingReservation = await this.prisma.reservation.findFirst({
      where: {
        spaceId: dto.spaceId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELED' },
      },
    });

    if (existingReservation) {
      throw new ConflictException(
        'Este espaço já está reservado para esta data.',
      );
    }

    const price = Number(space.price || 0);
    const paymentActive = settings?.payment_active !== false;
    const requiresPayment = price > 0 && paymentActive;

    const initialStatus = requiresPayment ? 'PENDING' : 'CONFIRMED';
    const paymentDeadline = requiresPayment ? addMinutes(new Date(), 20) : null;
    const validationToken = !requiresPayment ? uuidv4() : null;

    // 4. CRIA A RESERVA VINCULADA AO CLIENTE
    const reservation = await this.prisma.reservation.create({
      data: {
        nightclubId: dto.nightclubId,
        spaceId: dto.spaceId,
        // Dados snapshot (para agilidade)
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        // 🔗 O VÍNCULO SAGRADO
        customerId: customer.id,

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
  // 2. LISTAR TODAS (Dashboard & Filtros - BLINDADO 🛡️)
  // ===========================================================================
  async findAll(date?: string, nightclubId?: string) {
    if (!nightclubId) {
      throw new UnauthorizedException('Identificação da balada ausente.');
    }

    const where: any = { nightclubId };

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      where.date = { gte: startOfDay, lte: endOfDay };
    }

    return this.prisma.reservation.findMany({
      where,
      // 🚨 Mário: Trazemos o customer também para você ver se ele está bloqueado na lista!
      include: { space: true, nightclub: true, customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 3. CHECKOUT (Mantido igual)
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
  // 4. GERAR PIX (Mantido igual)
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

    const rawToken = settings.mpAccessToken;
    const accessTokenParaUsar =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || platformToken;

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

      const response = await payment.create({ body: paymentBody });

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
  // 5. WEBHOOK (Mantido igual)
  // ===========================================================================
  async processWebhook(paymentId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { paymentId: paymentId.toString() },
      include: { nightclub: true },
    });

    if (!reservation || reservation.status === 'CONFIRMED') return;

    const settings = (reservation.nightclub.settings as any) || {};
    const platformToken = this.configService.get('MP_PLATFORM_ACCESS_TOKEN');

    const rawToken = settings.mpAccessToken;
    const activeAccessToken =
      rawToken && rawToken.includes(':')
        ? decrypt(rawToken)
        : rawToken || platformToken;

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
  // 6. PORTARIA / CHECK-IN (Mantido igual)
  // ===========================================================================
  async checkInByToken(token: string, nightclubId?: string) {
    const where: any = { validationToken: token };

    if (nightclubId) where.nightclubId = nightclubId;

    const reservation = await this.prisma.reservation.findFirst({ where });

    if (!reservation)
      throw new NotFoundException('Token inválido para esta unidade.');
    if (reservation.status === 'CHECKED_IN')
      throw new ConflictException('Já foi validado.');

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CHECKED_IN', checkInAt: new Date() },
      include: { space: true, nightclub: true },
    });
  }

  // ===========================================================================
  // 7. CRON JOB (Mantido igual)
  // ===========================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const now = new Date();
    const result = await this.prisma.reservation.updateMany({
      where: {
        status: 'PENDING',
        paymentDeadline: { lt: now },
      },
      data: { status: 'CANCELED' },
    });
    if (result.count > 0)
      console.log(`[CRON] 🧹 ${result.count} reservas expiradas canceladas.`);
  }

  // ===========================================================================
  // 8. CRUD PADRÃO
  // ===========================================================================
  async findOne(id: string) {
    return this.prisma.reservation.findUnique({
      where: { id },
      include: { space: true, nightclub: true },
    });
  }

  async update(id: string, dto: UpdateReservationDto) {
    return this.prisma.reservation.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    return this.prisma.reservation.delete({ where: { id } });
  }
  // ===========================================================================
  // 9. CHECAR DISPONIBILIDADE (Para pintar o mapa de cinza)
  // ===========================================================================
  async getBookedSpaces(nightclubId: string, dateString: string) {
    // Garante o intervalo do dia inteiro (00:00 até 23:59)
    // Assumindo que a data vem 'YYYY-MM-DD'
    const startOfDay = new Date(`${dateString}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateString}T23:59:59.999Z`);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        nightclubId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELED' }, // Ignora os cancelados, esses estão livres!
      },
      select: { spaceId: true }, // Só precisamos saber o ID da mesa
    });

    // Retorna apenas um array simples: ['id-mesa-1', 'id-mesa-2']
    return reservations.map((r) => r.spaceId);
  }
}
