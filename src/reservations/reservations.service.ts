import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
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
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
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

    // Validações básicas de cliente
    if (!dto.customerEmail || !dto.customerName || !dto.customerPhone) {
      throw new BadRequestException(
        'Nome, E-mail e Telefone são obrigatórios.',
      );
    }

    // --- CRM & BLACKLIST ---
    let customer = await this.prisma.customer.findUnique({
      where: { email: dto.customerEmail },
    });

    if (customer && customer.isBlocked) {
      throw new ForbiddenException(
        'Sua conta possui restrições administrativas. Entre em contato com a gerência.',
      );
    }

    // 🎂 Lógica de Aniversário: Se o DTO trouxer data, usamos.
    // Se não trouxer, mas marcar isBirthday, tentamos manter o que já existe no cadastro.
    const birthdayDate = dto.birthdayDate
      ? new Date(dto.birthdayDate)
      : customer?.birthdayDate || null;

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          email: dto.customerEmail,
          name: dto.customerName,
          phone: dto.customerPhone,
          birthdayDate: birthdayDate, // Salva no perfil do cliente pela primeira vez
        },
      });
    } else {
      // Atualiza os dados do cliente no CRM a cada nova reserva
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: dto.customerName,
          phone: dto.customerPhone,
          // Só atualiza a data de nascimento se ela for enviada agora
          ...(dto.birthdayDate && { birthdayDate: birthdayDate }),
        },
      });
    }

    // --- VALIDAÇÃO DE DATA E DIAS DE FUNCIONAMENTO ---
    const safeDateString = dto.date.includes('T')
      ? dto.date
      : `${dto.date}T12:00:00.000Z`;
    const checkDate = new Date(safeDateString);

    const settings = (nightclub.settings as any) || {};
    const openingDays = settings.openingDays as number[];

    if (openingDays && openingDays.length > 0) {
      const dayOfWeek = checkDate.getDay();
      if (!openingDays.includes(dayOfWeek)) {
        throw new BadRequestException(`A casa não abre neste dia.`);
      }
    }

    // --- VALIDAÇÃO DE DISPONIBILIDADE ---
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
      throw new ConflictException('Este espaço já está reservado.');
    }

    // --- LÓGICA DE PAGAMENTO ---
    const price = Number(space.price || 0);
    const paymentActive = settings?.payment_active !== false;
    const requiresPayment = price > 0 && paymentActive;

    const initialStatus = requiresPayment ? 'PENDING' : 'CONFIRMED';
    const paymentDeadline = requiresPayment ? addMinutes(new Date(), 20) : null;
    const validationToken = !requiresPayment ? uuidv4() : null;

    // --- CRIAÇÃO DA RESERVA ---
    const reservation = await this.prisma.reservation.create({
      data: {
        nightclubId: dto.nightclubId,
        spaceId: dto.spaceId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        customerId: customer.id,
        date: checkDate,
        notes: dto.notes,
        isBirthday: dto.isBirthday || false,
        birthdayDate: birthdayDate,
        status: initialStatus,
        amount: price,
        paymentDeadline,
        validationToken,
      },
      // ✅ Agora trazemos o Space e o Nightclub (com settings) em uma única consulta
      include: {
        space: true,
        nightclub: {
          select: {
            id: true,
            name: true,
            settings: true, // Aqui evita o erro de 'undefined settings'
          },
        },
      },
    });

    // Envio de e-mail e Push para reservas gratuitas/cortesia (Confirmadas na hora)
    if (!requiresPayment) {
      // 1. Envia o e-mail
      if (reservation.customerEmail) {
        await this.mailService
          .sendReservationConfirmation(
            reservation as any,
            reservation.nightclub.name,
          )
          .catch((err) => console.error('Erro e-mail:', err.message));
      }

      // 2. 🔔 DISPARA A NOTIFICAÇÃO PUSH
      // Agora usamos o include do create para pegar o space.name com segurança
      await this.notificationsService
        .notifyNewReservation(dto.nightclubId, {
          id: reservation.id,
          customerName: reservation.customerName,
          spaceName: (reservation as any).space.name,
        })
        .catch((err) => console.error('Erro Push:', err.message));
    }

    return {
      ...reservation,
      action: requiresPayment ? 'REDIRECT_CHECKOUT' : 'SHOW_CONFIRMATION',
    };

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
      include: { space: true, nightclub: true, customer: true },
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
  // 4. GERAR PIX
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

      // 🛡️ TRAVA DE SEGURANÇA PARA O E-MAIL (Resolve o erro do Mercado Pago)
      // Se o e-mail não tiver '@' ou for muito curto, usamos um fallback para não travar o PIX
      const validEmail =
        reservation.customerEmail && reservation.customerEmail.includes('@')
          ? reservation.customerEmail.trim().toLowerCase()
          : `cliente.${reservation.id.substring(0, 5)}@reservasclub.com.br`;

      const paymentBody: any = {
        transaction_amount: amount,
        description: `Reserva: ${reservation.nightclub.name} - ${reservation.space.name}`,
        payment_method_id: 'pix',
        payer: {
          email: validEmail, // 👈 Agora garantido
          first_name: reservation.customerName.split(' ')[0] || 'Cliente',
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

        // 🔔 DISPARO DA NOTIFICAÇÃO PUSH
        // Isso vai fazer o celular do dono/gerente apitar na hora!
        await this.notificationsService
          .notifyNewReservation(updated.nightclubId, {
            id: updated.id,
            customerName: updated.customerName,
            spaceName: updated.space.name,
          })
          .catch((err) =>
            console.error('Erro ao enviar notificação push:', err.message),
          );
      }
    } catch (error: any) {
      console.error('Erro Webhook:', error.message);
    }
  }
  // ===========================================================================
  // 6. PORTARIA / CHECK-IN
  // ===========================================================================
  async checkInByToken(token: string, nightclubId?: string) {
    // 1. Tentar encontrar na tabela de RESERVAS (Mesas/Camarotes)
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        validationToken: token,
        ...(nightclubId && { nightclubId }),
      },
      include: { space: true, nightclub: true },
    });

    if (reservation) {
      if (reservation.status === 'CHECKED_IN') {
        throw new ConflictException('Esta reserva já foi validada.');
      }

      return this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'CHECKED_IN', checkInAt: new Date() },
        include: { space: true, nightclub: true },
      });
    }

    // 2. Se não achou na reserva, tentar encontrar na LISTA VIP
    const vipGuest = await this.prisma.vipGuest.findFirst({
      where: {
        validationToken: token,
        // Filtramos pelo nightclub através do vínculo com o token pai
        ...(nightclubId && { vipToken: { nightclubId } }),
      },
      include: { vipToken: { include: { nightclub: true } } },
    });

    if (vipGuest) {
      if (vipGuest.status === 'CHECKED_IN') {
        throw new ConflictException('Este convidado VIP já entrou.');
      }

      // Atualiza o convidado VIP para dentro da casa
      const updatedVip = await this.prisma.vipGuest.update({
        where: { id: vipGuest.id },
        data: { status: 'CHECKED_IN', checkInAt: new Date() },
      });

      // Mapeamos para um formato que o Frontend do Check-in entenda
      return {
        id: updatedVip.id,
        customerName: updatedVip.name,
        customerEmail: 'Lista VIP',
        customerPhone: updatedVip.phone,
        status: updatedVip.status,
        date: vipGuest.createdAt,
        amount: 0, // Geralmente lista VIP é free ou paga na porta
        isVip: true, // Flag para o front saber que é VIP
        space: { name: `LISTA: ${vipGuest.vipToken.code}` },
        nightclub: vipGuest.vipToken.nightclub,
      };
    }

    // 3. Se não achou em nenhum dos dois
    throw new NotFoundException(
      'Token inválido ou não encontrado para esta unidade.',
    );
  }

  // ===========================================================================
  // 7. CRON JOB (CANCELAMENTO DE PENDENTES)
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
  // 9. CHECAR DISPONIBILIDADE
  // ===========================================================================
  async getBookedSpaces(nightclubId: string, dateString: string) {
    const startOfDay = new Date(`${dateString}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateString}T23:59:59.999Z`);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        nightclubId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELED' },
      },
      select: { spaceId: true },
    });

    return reservations.map((r) => r.spaceId);
  }

  // ===========================================================================
  // 10. RESET DIÁRIO (MEIA-NOITE) 🧹
  // ===========================================================================
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyReset() {
    console.log('🧹 Iniciando reset diário de ocupação...');

    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);

    // Muda o status para 'CHECKED_IN' (ou 'COMPLETED') para liberar o mapa no dia seguinte
    const result = await this.prisma.reservation.updateMany({
      where: {
        date: { lt: yesterday },
        status: 'CONFIRMED',
      },
      data: { status: 'CHECKED_IN' },
    });

    console.log(`✅ Reset concluído: ${result.count} espaços liberados.`);
  }
}
