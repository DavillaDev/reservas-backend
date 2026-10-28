import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

@Injectable()
export class OrderFulfillmentService {
  private readonly logger = new Logger(OrderFulfillmentService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  // 🛡️ MOTOR DE RESILIÊNCIA (Para chamadas externas como WhatsApp)
  private async withRetry<T>(operation: () => any, maxRetries = 3): Promise<T> {
    let attempt = 1;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        const delay = attempt * 1000;
        await new Promise((res) => setTimeout(res, delay));
        attempt++;
      }
    }
    throw new Error('Falha inesperada no motor de retry.');
  }

  // ===========================================================================
  // 1. CONFIRMAÇÃO DA RESERVA E DISTRIBUIÇÃO DE COMISSÃO
  // ===========================================================================
  async confirmReservation(reservationId: string, paymentId: string) {
    const validationToken = uuidv4();

    const existingRes = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { promoter: true },
    });

    if (!existingRes) {
      this.logger.warn(
        `Reserva ${reservationId} não encontrada para confirmação.`,
      );
      return;
    }

    let commissionData = {};

    // 💰 CÁLCULO DE COMISSÃO DO PROMOTER
    if (existingRes.promoterId && existingRes.promoter) {
      const promoter = existingRes.promoter;
      const resAmount = Number(existingRes.amount || 0);
      let calcCommission = 0;

      if (resAmount > 0) {
        if (promoter.commissionType === 'FIXED') {
          calcCommission = Number(promoter.commissionValue || 0);
        } else if (promoter.commissionType === 'PERCENTAGE') {
          calcCommission =
            (resAmount * Number(promoter.commissionValue || 0)) / 100;
        }

        commissionData = {
          commissionAmount: calcCommission,
          commissionStatus: 'APPROVED',
        };

        this.logger.log(
          `💰 [COMISSÃO] Calculada: R$ ${calcCommission} para o promoter ${promoter.name}`,
        );
      }
    }

    // ✅ ATUALIZAÇÃO NO BANCO DE DADOS
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CONFIRMED',
        validationToken,
        paymentId: paymentId.toString(),
        ...commissionData,
      },
      include: { space: true, nightclub: true },
    });

    this.logger.log(`✅ [WEBHOOK] Reserva ${updated.id} confirmada.`);

    // 🚀 DISPARO DE AÇÕES PÓS-VENDA
    this.executePostFulfillmentActions(updated);

    return updated;
  }

  // ===========================================================================
  // 1.5. CONFIRMAÇÃO DE INGRESSOS (COM E-MAIL E WHATSAPP)
  // ===========================================================================
  async confirmTickets(paymentId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        paymentId: {
          startsWith: paymentId.toString(),
        },
      },
      include: {
        event: {
          include: { nightclub: true },
        },
        batch: true,
      },
    });

    if (tickets.length === 0) return false;

    // Trava de idempotência
    const alreadyPaid = tickets.every((t) => t.status === 'PAID');
    if (alreadyPaid) return true;

    // Atualiza status para PAID
    await this.prisma.ticket.updateMany({
      where: {
        paymentId: {
          startsWith: paymentId.toString(),
        },
      },
      data: { status: 'PAID' },
    });

    // Incrementa o estoque vendido no lote
    const batchId = tickets[0].batchId;
    await this.prisma.ticketBatch.update({
      where: { id: batchId },
      data: {
        soldQuantity: {
          increment: tickets.length,
        },
      },
    });

    this.logger.log(
      `🎟️ [WEBHOOK] ${tickets.length} ingresso(s) confirmado(s) para o pagamento ${paymentId}!`,
    );

    const firstTicket = tickets[0];

    // 📧 DISPARO DE E-MAIL PARA O COMPRADOR (Enviando o primeiro ticket ou estrutura compatível)
    if (firstTicket.customerEmail) {
      this.mailService
        .sendReservationConfirmation(
          {
            ...firstTicket,
            amount: Number(firstTicket.price) * tickets.length,
            date: firstTicket.event.date,
            space: {
              name: `Ingresso: ${firstTicket.batch.name} (${tickets.length}x)`,
            },
            validationToken: firstTicket.validationToken,
          },
          firstTicket.event.nightclub.name,
        )
        .catch((err) =>
          this.logger.error('Erro ao enviar e-mail de ingressos:', err.message),
        );
    }

    // 📲 Dispara o WhatsApp para o comprador dos ingressos
    this.dispararIngressosWhatsapp(firstTicket, tickets.length).catch((err) =>
      this.logger.error(
        '❌ Erro no envio de ingressos via WhatsApp:',
        err.message,
      ),
    );

    return true;
  }

  // ===========================================================================
  // 2. AÇÕES PÓS-VENDA (Reservas)
  // ===========================================================================
  private executePostFulfillmentActions(reservation: any) {
    if (reservation.customerEmail) {
      this.mailService
        .sendReservationConfirmation(reservation, reservation.nightclub.name)
        .catch((err) =>
          this.logger.error('Erro ao enviar e-mail:', err.message),
        );
    }

    this.notificationsService
      .notifyNewReservation(reservation.nightclubId, {
        id: reservation.id,
        customerName: reservation.customerName,
        spaceName: reservation.space.name,
      })
      .catch((err) => this.logger.error('Erro ao enviar Push:', err.message));

    this.dispararIngressoWhatsapp(reservation).catch((err) =>
      this.logger.error('❌ Erro no Ingresso WhatsApp:', err.message),
    );
  }

  // ===========================================================================
  // 3. INTEGRAÇÃO WHATSAPP (Reserva)
  // ===========================================================================
  private async dispararIngressoWhatsapp(reservation: any) {
    try {
      const serviceIaUrl =
        this.configService.get('SERVICE_IA_URL') || 'http://localhost:10000';
      const internalKey = this.configService.get('INTERNAL_SERVICE_KEY');
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'https://reservasclub.com.br';

      const checkoutLink = `${frontendUrl}/checkout/${reservation.id}`;

      const mensagem =
        `✅ *PAGAMENTO CONFIRMADO!*\n\n` +
        `Fala *${reservation.customerName.split(' ')[0]}*! Sua reserva na *${reservation.nightclub.name.toUpperCase()}* está garantida.\n\n` +
        `📍 *Setor:* ${reservation.space.name}\n\n` +
        `🎫 *SEU INGRESSO DIGITAL ESTÁ AQUI:*\n` +
        `${checkoutLink}\n\n` +
        `Acesse o link acima para abrir seu QR Code de entrada. Apresente na portaria e boa festa! 🥂`;

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
            timeout: 5000,
          },
        ),
      );

      this.logger.log(
        `📲 [WhatsApp] Confirmação enviada para ${reservation.customerPhone}`,
      );
    } catch (error: any) {
      this.logger.error(
        'Falha ao disparar WhatsApp de reserva:',
        error.message,
      );
    }
  }

  // ===========================================================================
  // 3.5. INTEGRAÇÃO WHATSAPP (Ingressos)
  // ===========================================================================
  private async dispararIngressosWhatsapp(ticket: any, quantity: number) {
    try {
      const serviceIaUrl =
        this.configService.get('SERVICE_IA_URL') || 'http://localhost:10000';
      const internalKey = this.configService.get('INTERNAL_SERVICE_KEY');
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'https://reservasclub.com.br';

      // Link onde o cliente visualiza os ingressos/QR codes dele
      const eventLink = `${frontendUrl}/events/${ticket.eventId}/my-tickets`;

      const mensagem =
        `✅ *PAGAMENTO DE INGRESSOS CONFIRMADO!*\n\n` +
        `Fala *${ticket.customerName.split(' ')[0]}*! Seus *${quantity}x ingresso(s)* para o evento *${ticket.event.title.toUpperCase()}* (${ticket.batch.name}) estão garantidos!\n\n` +
        `🎫 *SEUS QR CODES DE ENTRADA:*\n` +
        `${eventLink}\n\n` +
        `Acesse o link acima para visualizar os QR Codes individuais de cada ingresso. Apresente na portaria e boa festa! 🥂`;

      await this.withRetry(() =>
        axios.post(
          `${serviceIaUrl}/whatsapp/send-message`,
          {
            nightclubId: ticket.event.nightclubId,
            number: ticket.customerPhone,
            text: mensagem,
          },
          {
            headers: { 'x-internal-key': internalKey },
            timeout: 5000,
          },
        ),
      );

      this.logger.log(
        `📲 [WhatsApp] Ingressos enviados para ${ticket.customerPhone}`,
      );
    } catch (error: any) {
      this.logger.error(
        'Falha ao disparar WhatsApp de ingressos:',
        error.message,
      );
    }
  }
}
