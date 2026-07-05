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
import { addMinutes } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client'; // 👈 Importado para tipar filtros do Prisma

// 🛡️ NOVO: Interface para tipar o JSON do banco e sumir com os erros de 'any'
interface NightclubSettings {
  openingDays?: number[];
  payment_active?: boolean;
}

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private notificationsService: NotificationsService,
  ) {}

  // ===========================================================================
  // 1. CRIAR RESERVA (COM BLACKLIST, CRM E REGRA DE ANIVERSÁRIO 🔒🎂)
  // ===========================================================================
  async create(dto: CreateReservationDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });

    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id: dto.nightclubId },
      select: {
        id: true,
        name: true,
        settings: true,
        aiAgent: {
          select: { birthdayPrice: true },
        },
      },
    });

    if (!space || !nightclub) {
      throw new NotFoundException('Balada ou espaço não encontrados.');
    }

    if (!dto.customerEmail || !dto.customerName || !dto.customerPhone) {
      throw new BadRequestException(
        'Nome, E-mail e Telefone são obrigatórios.',
      );
    }

    // --- VALIDAÇÃO DE PROMOTER (NOVO) ---
    if (dto.promoterId) {
      const promoterExists = await this.prisma.user.findUnique({
        where: { id: dto.promoterId },
        select: { id: true, role: true },
      });

      // Se o ID for inválido ou não for de um promoter, anulamos o vínculo silenciosamente
      if (!promoterExists || promoterExists.role !== 'PROMOTER') {
        dto.promoterId = undefined;
      }
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

    // 🎂 Lógica de Aniversário (Data do cliente)
    const birthdayDate = dto.birthdayDate
      ? new Date(dto.birthdayDate)
      : customer?.birthdayDate || null;

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          email: dto.customerEmail,
          name: dto.customerName,
          phone: dto.customerPhone,
          birthdayDate: birthdayDate,
        },
      });
    } else {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: dto.customerName,
          phone: dto.customerPhone,
          ...(dto.birthdayDate && { birthdayDate: birthdayDate }),
        },
      });
    }

    // --- VALIDAÇÃO DE DATA E DIAS DE FUNCIONAMENTO ---
    const safeDateString = dto.date.includes('T')
      ? dto.date
      : `${dto.date}T12:00:00.000Z`;
    const checkDate = new Date(safeDateString);

    // 🛡️ CORRIGIDO: Tipagem segura aplicada no lugar do 'any'
    const settings = (nightclub.settings as NightclubSettings) || {};
    const openingDays = settings.openingDays;

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

    // ==========================================================
    // 💰 LÓGICA DE PAGAMENTO BLINDADA
    // ==========================================================
    let price = Number(space.price || 0);

    if (
      dto.isBirthday &&
      nightclub.aiAgent?.birthdayPrice !== null &&
      nightclub.aiAgent?.birthdayPrice !== undefined
    ) {
      price = Number(nightclub.aiAgent.birthdayPrice);
    }

    // 🛡️ CORRIGIDO: Agora o TypeScript sabe que payment_active é um boolean seguro
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
        promoterId: dto.promoterId, // 👈 INSERIDO: Vínculo do Promoter salvo no banco
      },
      include: {
        space: true,
        nightclub: {
          select: {
            id: true,
            name: true,
            settings: true,
          },
        },
      },
    });

    if (!requiresPayment) {
      if (reservation.customerEmail) {
        // Ignorando a tipagem de serviço externo momentaneamente, caso o MailService exija algo estrito
        await this.mailService
          .sendReservationConfirmation(
            reservation as never,
            reservation.nightclub.name,
          )
          .catch((err: Error) => console.error('Erro e-mail:', err.message));
      }

      await this.notificationsService
        .notifyNewReservation(dto.nightclubId, {
          id: reservation.id,
          customerName: reservation.customerName,
          spaceName: reservation.space.name, // 🛡️ CORRIGIDO: Removido o 'any' do space.name
        })
        .catch((err: Error) => console.error('Erro Push:', err.message));
    }

    return {
      ...reservation,
      action: requiresPayment ? 'REDIRECT_CHECKOUT' : 'SHOW_CONFIRMATION',
    };
  }

  // ===========================================================================
  // 2. LISTAR TODAS (Dashboard & Filtros - BLINDADO 🛡️)
  // ===========================================================================
  async findAll(date?: string, nightclubId?: string, promoterId?: string) {
    if (!nightclubId) {
      throw new UnauthorizedException('Identificação da balada ausente.');
    }

    const where: Prisma.ReservationWhereInput = { nightclubId };

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      where.date = { gte: startOfDay, lte: endOfDay };
    }

    // 🛡️ NOVO: Se vier o ID do Promoter, a API blinda e devolve SÓ as reservas dele
    if (promoterId) {
      where.promoterId = promoterId;
    }

    return this.prisma.reservation.findMany({
      where,
      include: { space: true, nightclub: true, customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 3. PORTARIA / CHECK-IN
  // ===========================================================================
  async checkInByToken(token: string, nightclubId?: string) {
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

    const vipGuest = await this.prisma.vipGuest.findFirst({
      where: {
        validationToken: token,
        ...(nightclubId && { vipToken: { nightclubId } }),
      },
      include: { vipToken: { include: { nightclub: true } } },
    });

    if (vipGuest) {
      if (vipGuest.status === 'CHECKED_IN') {
        throw new ConflictException('Este convidado VIP já entrou.');
      }

      const updatedVip = await this.prisma.vipGuest.update({
        where: { id: vipGuest.id },
        data: { status: 'CHECKED_IN', checkInAt: new Date() },
      });

      return {
        id: updatedVip.id,
        customerName: updatedVip.name,
        customerEmail: 'Lista VIP',
        customerPhone: updatedVip.phone,
        status: updatedVip.status,
        date: vipGuest.createdAt,
        amount: 0,
        isVip: true,
        space: { name: `LISTA: ${vipGuest.vipToken.code}` },
        nightclub: vipGuest.vipToken.nightclub,
      };
    }

    throw new NotFoundException(
      'Token inválido ou não encontrado para esta unidade.',
    );
  }

  // ===========================================================================
  // 4. CRON JOB (CANCELAMENTO DE PENDENTES)
  // ===========================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const now = new Date();

    try {
      const countPending = await this.prisma.reservation.count({
        where: {
          status: 'PENDING',
          paymentDeadline: {
            lt: now,
            not: null,
          },
        },
      });

      if (countPending > 0) {
        console.log(
          `[CRON] 🔍 Encontradas ${countPending} reservas candidatas ao cancelamento. (Agora: ${now.toISOString()})`,
        );
      }

      const result = await this.prisma.reservation.updateMany({
        where: {
          status: 'PENDING',
          paymentDeadline: {
            lt: now,
            not: null,
          },
        },
        data: { status: 'CANCELED' },
      });

      if (result.count > 0) {
        console.log(
          `[CRON] 🧹 ${result.count} reservas expiradas foram canceladas com sucesso.`,
        );
      }
    } catch (error: unknown) {
      // 🛡️ CORRIGIDO: Tratamento de erro seguro
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(
        `[CRON ERROR] Falha ao processar faxina de reservas:`,
        errorMessage,
      );
    }
  }

  // ===========================================================================
  // 5. CRUD PADRÃO
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
  // 6. CHECAR DISPONIBILIDADE
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
}
