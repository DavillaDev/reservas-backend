// src/events/tickets.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Ticket, TicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { isAfter } from 'date-fns';
import { decrypt } from '../common/utils/encryption.util';
import axios from 'axios';

interface MercadoPagoPaymentResponse {
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  status?: string;
  [key: string]: unknown;
}

function getErrorDetails(error: unknown): {
  data: unknown;
  message: string;
} {
  const err = error as Record<string, unknown>;
  const response = err?.response as Record<string, unknown> | undefined;
  const data = response?.data;
  const message =
    typeof err?.message === 'string' ? err.message : 'Erro desconhecido';

  return { data, message };
}

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  private async withRetry<T>(operation: () => any, maxRes = 3): Promise<T> {
    let attempt = 1;
    while (attempt <= maxRes) {
      try {
        return await operation();
      } catch (error: any) {
        if (attempt === maxRes) throw error;
        const delay = attempt * 1000;
        await new Promise((res) => setTimeout(res, delay));
        attempt++;
      }
    }
    throw new Error('Falha inesperada no motor de retry.');
  }

  private async expireOutdatedPendingTickets(batchId: string) {
    const now = new Date();

    const expiredTickets = await this.prisma.ticket.findMany({
      where: {
        batchId,
        status: TicketStatus.PENDING,
        paymentDeadline: {
          lt: now,
        },
      },
    });

    if (expiredTickets.length === 0) return;

    const expiredIds = expiredTickets.map((t) => t.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: TicketStatus.CANCELED },
      });

      await tx.ticketBatch.update({
        where: { id: batchId },
        data: {
          soldQuantity: {
            decrement: expiredTickets.length,
          },
        },
      });
    });

    console.log(
      `🧹 [TicketsService] ${expiredTickets.length} ingressos expirados tiveram o estoque devolvido ao lote ${batchId}.`,
    );
  }

  private getNightclubAccessToken(nightclub: any): string {
    let nightclubSettings: any = {};
    if (nightclub.settings) {
      if (typeof nightclub.settings === 'string') {
        try {
          nightclubSettings = JSON.parse(nightclub.settings);
        } catch (e) {
          console.error('Erro ao ler settings da balada:', e);
        }
      } else {
        nightclubSettings = nightclub.settings;
      }
    }

    const tokenRaiz = nightclub.mpAccessToken;
    const tokenSettings = nightclubSettings.mpAccessToken;
    const rawToken = tokenRaiz || tokenSettings;

    if (!rawToken || typeof rawToken !== 'string') {
      return '';
    }

    try {
      const tokenLimpo = rawToken.trim();
      if (tokenLimpo.includes(':')) {
        return decrypt(tokenLimpo).trim();
      }
      return tokenLimpo;
    } catch (error) {
      console.error('Falha ao descriptografar token do MP:', error);
      return '';
    }
  }

  async createTickets(dto: CreateTicketDto) {
    await this.expireOutdatedPendingTickets(dto.batchId);

    const batch = await this.prisma.ticketBatch.findUnique({
      where: { id: dto.batchId },
      include: {
        event: {
          include: {
            nightclub: true,
          },
        },
      },
    });

    if (!batch || !batch.isActive) {
      throw new NotFoundException(
        'Lote de ingressos não encontrado ou inativo.',
      );
    }

    const availableStock = batch.totalQuantity - batch.soldQuantity;

    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `Estoque insuficiente. Restam apenas ${availableStock} ingressos neste lote.`,
      );
    }

    const nightclub = batch.event.nightclub;
    const primaryAccessToken = this.getNightclubAccessToken(nightclub);
    const fallbackAccessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;

    if (!primaryAccessToken && !fallbackAccessToken) {
      throw new BadRequestException(
        'A balada não possui credenciais do Mercado Pago e nenhum token de plataforma foi configurado.',
      );
    }

    const unitPrice = Number(batch.price);
    const totalAmount = unitPrice * dto.quantity;
    const paymentId = `TICKET_${randomUUID()}`;
    const paymentDeadline = new Date(Date.now() + 30 * 60 * 1000);

    const createdTickets: Ticket[] = [];

    for (let i = 0; i < dto.quantity; i++) {
      const ticket = await this.prisma.ticket.create({
        data: {
          eventId: batch.eventId,
          batchId: batch.id,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          customerCpf: dto.customerCpf,
          price: unitPrice,
          status: TicketStatus.PENDING,
          validationToken: randomUUID(),
          paymentId: `${paymentId}_${i}`,
          paymentDeadline,
        },
      });

      createdTickets.push(ticket);
    }

    const requestMpPix = async (token: string) => {
      const client = new MercadoPagoConfig({ accessToken: token });
      const payment = new Payment(client);

      return payment.create({
        body: {
          transaction_amount: totalAmount,
          description: `Compra de ${dto.quantity}x Ingresso(s) - ${batch.event.title} (${batch.name})`,
          payment_method_id: 'pix',
          payer: {
            email: dto.customerEmail || 'cliente@reservasclub.com',
            first_name: dto.customerName,
            identification: dto.customerCpf
              ? {
                  type: 'CPF',
                  number: dto.customerCpf,
                }
              : undefined,
          },
          date_of_expiration: paymentDeadline.toISOString(),
          external_reference: paymentId,
        },
      });
    };

    try {
      let mpResponse: any;

      try {
        if (primaryAccessToken) {
          mpResponse = await requestMpPix(primaryAccessToken);
        } else {
          throw new Error('Token da balada não disponível, usando fallback.');
        }
      } catch (primaryError: unknown) {
        const { data, message } = getErrorDetails(primaryError);

        console.warn(
          '⚠️ [TicketsService] Falha ao gerar Pix com o token da balada. Tentando MP_PLATFORM_ACCESS_TOKEN...',
          data ?? message,
        );

        if (!fallbackAccessToken) {
          throw primaryError;
        }

        mpResponse = await requestMpPix(fallbackAccessToken);
      }

      const transactionData = mpResponse.point_of_interaction?.transaction_data;

      const qrCodePix: string = transactionData?.qr_code ?? '';
      const qrCodeBase64: string = transactionData?.qr_code_base64 ?? '';
      const ticketUrl: string = transactionData?.ticket_url ?? '';
      const mpPaymentId = mpResponse.id?.toString() || paymentId;

      await this.prisma.ticket.updateMany({
        where: {
          paymentId: {
            startsWith: paymentId,
          },
        },
        data: {
          paymentId: mpPaymentId,
        },
      });

      return {
        success: true,
        totalAmount,
        ticketsCount: createdTickets.length,
        paymentId: mpPaymentId,
        pix: {
          qrCode: qrCodePix,
          qrCodeBase64,
          ticketUrl,
        },
        tickets: createdTickets.map((ticket) => ({
          id: ticket.id,
          validationToken: ticket.validationToken,
        })),
      };
    } catch (error: unknown) {
      const { data, message } = getErrorDetails(error);

      console.error(
        'Erro ao gerar pagamento no Mercado Pago:',
        data ?? message,
      );

      throw new BadRequestException(
        'Erro ao gerar cobrança Pix no Mercado Pago. Tente novamente.',
      );
    }
  }

  async getCheckoutData(paymentId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        OR: [
          { paymentId: paymentId },
          { paymentId: { startsWith: paymentId } },
        ],
      },
      include: {
        event: {
          include: {
            nightclub: true,
          },
        },
        batch: true,
      },
    });

    if (!tickets || tickets.length === 0) {
      throw new NotFoundException('Cobrança ou ingressos não encontrados.');
    }

    const firstTicket = tickets[0];
    const event = firstTicket.event;
    const nightclub = event.nightclub;

    let isPaid = tickets.every((t) => t.status === TicketStatus.PAID);

    if (
      !isPaid &&
      firstTicket.paymentDeadline &&
      isAfter(new Date(), new Date(firstTicket.paymentDeadline))
    ) {
      await this.prisma.ticket.updateMany({
        where: {
          paymentId: firstTicket.paymentId || paymentId,
        },
        data: { status: TicketStatus.CANCELED },
      });
      throw new BadRequestException(
        'O prazo para pagamento deste ingresso expirou.',
      );
    }

    let pixData = {
      qrCode: '',
      qrCodeBase64: '',
      ticketUrl: '',
      expiresAt: firstTicket.paymentDeadline,
    };

    if (!isPaid && firstTicket.paymentId) {
      try {
        const token =
          this.getNightclubAccessToken(nightclub) ||
          process.env.MP_PLATFORM_ACCESS_TOKEN;

        if (token) {
          const client = new MercadoPagoConfig({ accessToken: token });
          const payment = new Payment(client);

          const existing: any = await this.withRetry(() =>
            payment.get({ id: firstTicket.paymentId as string }),
          );

          if (existing.status === 'approved') {
            await this.prisma.ticket.updateMany({
              where: { paymentId: firstTicket.paymentId },
              data: { status: TicketStatus.PAID },
            });
            isPaid = true;

            // Dispara e-mail de confirmação blindado contra erros de propriedades ausentes
            if (firstTicket.customerEmail) {
              this.mailService
                .sendReservationConfirmation(
                  {
                    ...firstTicket,
                    customerName: firstTicket.customerName,
                    customerPhone: firstTicket.customerPhone,
                    customerEmail: firstTicket.customerEmail,
                    space: {
                      name: `${event.title} - ${firstTicket.batch?.name || 'Ingresso'}`,
                    },
                    amount: tickets.reduce(
                      (acc, t) => acc + Number(t.price),
                      0,
                    ),
                    nightclub: nightclub,
                  } as any,
                  nightclub?.name || event.title,
                )
                .catch((err) =>
                  console.error(
                    'Erro ao enviar e-mail de ingresso:',
                    err.message,
                  ),
                );
            }
          } else if (
            existing.status === 'pending' ||
            existing.status === 'in_process'
          ) {
            const transactionData =
              existing.point_of_interaction?.transaction_data;
            pixData.qrCode = transactionData?.qr_code || '';
            pixData.qrCodeBase64 = transactionData?.qr_code_base64 || '';
            pixData.ticketUrl = transactionData?.ticket_url || '';
          }
        }
      } catch (err) {
        console.warn(
          '⚠️ [TicketsService] Não foi possível recuperar o Pix ativo no Mercado Pago:',
          err,
        );
      }
    }

    const totalAmount = tickets.reduce((acc, t) => acc + Number(t.price), 0);

    return {
      paymentId: firstTicket.paymentId || paymentId,
      status: isPaid ? 'PAID' : 'PENDING',
      totalAmount,
      eventTitle: event.title,
      eventId: event.id,
      themeColor: nightclub?.themeColor || '#6366f1',
      pix: {
        ...pixData,
        amount: totalAmount,
      },
      tickets: tickets.map((t) => ({
        id: t.id,
        status: t.status,
        validationToken: t.validationToken,
        paymentDeadline: t.paymentDeadline,
      })),
    };
  }

  // ===========================================================================
  // 7. LISTAR INGRESSOS POR EVENTO (Para o Dashboard)
  // ===========================================================================
  async getTicketsByEvent(eventId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      include: {
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((t) => ({
      id: t.id,
      customerName: t.customerName,
      customerEmail: t.customerEmail,
      customerPhone: t.customerPhone,
      customerCpf: t.customerCpf,
      price: Number(t.price),
      status: t.status,
      batchName: t.batch?.name || 'Lote Único',
      validationToken: t.validationToken,
      createdAt: t.createdAt,
      paymentDeadline: t.paymentDeadline,
    }));
  }

  async validateTicket(validationToken: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { validationToken },
      include: {
        event: true,
        batch: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ingresso inválido ou não encontrado.');
    }

    if (ticket.status === TicketStatus.PENDING) {
      throw new BadRequestException('Este ingresso ainda não foi pago.');
    }

    if (ticket.status === TicketStatus.CHECKED_IN) {
      throw new BadRequestException(
        `Ingresso já utilizado! Check-in realizado em: ${ticket.updatedAt.toLocaleString(
          'pt-BR',
        )}`,
      );
    }

    if (ticket.status !== TicketStatus.PAID) {
      throw new BadRequestException(
        `Ingresso com status inválido: ${ticket.status}`,
      );
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        status: TicketStatus.CHECKED_IN,
      },
    });

    return {
      id: updatedTicket.id,
      customerName: updatedTicket.customerName,
      customerPhone: updatedTicket.customerPhone,
      customerEmail: updatedTicket.customerEmail,
      date: ticket.event.eventDate,
      amount: Number(updatedTicket.price),
      space: {
        name: `${ticket.event.title}\n${ticket.batch.name}`,
      },
      isTicket: true,
      isVip: false,
      status: updatedTicket.status,
    };
  }
}
