// src/events/tickets.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Ticket } from '@prisma/client';
import { randomUUID } from 'crypto';
import axios from 'axios';

interface MercadoPagoPaymentResponse {
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  [key: string]: unknown;
}

// Função auxiliar isolada com tipagem segura para calar o ESLint nos blocos catch
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
  constructor(private prisma: PrismaService) {}

  // 🛡️ Método privado para expirar tickets pendentes e devolver o estoque ao lote
  private async expireOutdatedPendingTickets(batchId: string) {
    const now = new Date();

    const expiredTickets = await this.prisma.ticket.findMany({
      where: {
        batchId,
        status: 'PENDING',
        paymentDeadline: {
          lt: now,
        },
      },
    });

    if (expiredTickets.length === 0) return;

    const expiredIds = expiredTickets.map((t) => t.id);

    await this.prisma.$transaction(async (tx) => {
      // 1. Atualiza os tickets expirados
      await tx.ticket.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });

      // 2. Devolve a quantidade de estoque ao lote
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

  async createTickets(dto: CreateTicketDto) {
    // 0. Limpa tickets pendentes expirados antes de validar estoque e criar novos
    await this.expireOutdatedPendingTickets(dto.batchId);

    // 1. Buscar o lote e o evento vinculado para pegar a balada e o preço
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

    // 2. Validar se há estoque suficiente no lote
    const availableStock = batch.totalQuantity - batch.soldQuantity;

    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `Estoque insuficiente. Restam apenas ${availableStock} ingressos neste lote.`,
      );
    }

    const nightclub = batch.event.nightclub;

    // Token principal da balada + fallback da plataforma
    const primaryAccessToken = nightclub.mpAccessToken;
    const fallbackAccessToken = process.env.MP_PLATFORM_ACCESS_TOKEN;

    if (!primaryAccessToken && !fallbackAccessToken) {
      throw new BadRequestException(
        'A balada não possui credenciais do Mercado Pago e nenhum token de plataforma foi configurado.',
      );
    }

    const unitPrice = Number(batch.price);
    const totalAmount = unitPrice * dto.quantity;
    const paymentId = `TICKET_${randomUUID()}`;

    // 3. Criar os ingressos como PENDING
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
          status: 'PENDING',
          validationToken: randomUUID(),
          paymentId: `${paymentId}_${i}`,
          paymentDeadline: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      createdTickets.push(ticket);
    }

    // Requisição Pix no Mercado Pago
    const requestMpPix = async (token: string) => {
      return axios.post<MercadoPagoPaymentResponse>(
        'https://api.mercadopago.com/v1/payments',
        {
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
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': paymentId,
          },
        },
      );
    };

    // 4. Integrar com o Mercado Pago para gerar a cobrança Pix
    try {
      let mpResponse;

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

        // Tenta com o token da plataforma
        mpResponse = await requestMpPix(fallbackAccessToken);
      }

      const paymentData = mpResponse.data as MercadoPagoPaymentResponse;

      const transactionData =
        paymentData.point_of_interaction?.transaction_data;

      const qrCodePix: string = transactionData?.qr_code ?? '';
      const qrCodeBase64: string = transactionData?.qr_code_base64 ?? '';
      const ticketUrl: string = transactionData?.ticket_url ?? '';

      return {
        success: true,
        totalAmount,
        ticketsCount: createdTickets.length,
        paymentId,
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

  // ===========================================================================
  // 5. VALIDAÇÃO DE ENTRADA NA PORTARIA (Check-in do Ingresso)
  // ===========================================================================
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

    if (ticket.status === 'PENDING') {
      throw new BadRequestException('Este ingresso ainda não foi pago.');
    }

    if (ticket.status === 'CHECKED_IN') {
      throw new BadRequestException(
        `Ingresso já utilizado! Check-in realizado em: ${ticket.updatedAt.toLocaleString()}`,
      );
    }

    if (ticket.status !== 'PAID') {
      throw new BadRequestException(
        `Ingresso com status inválido: ${ticket.status}`,
      );
    }

    // Atualiza o status para CHECKED_IN
    const updatedTicket = await this.prisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        status: 'CHECKED_IN',
      },
    });

    return {
      success: true,
      message: '✅ Entrada liberada com sucesso!',
      ticket: {
        id: updatedTicket.id,
        customerName: updatedTicket.customerName,
        eventTitle: ticket.event.title,
        batchName: ticket.batch.name,
      },
    };
  }
}
