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

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async createTickets(dto: CreateTicketDto) {
    // 1. Buscar o lote e o evento vinculado para pegar a balada e o preço
    const batch = await this.prisma.ticketBatch.findUnique({
      where: { id: dto.batchId },
      include: { event: { include: { nightclub: true } } },
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
    if (!nightclub.mpAccessToken) {
      throw new BadRequestException(
        'A balada não possui credenciais do Mercado Pago configuradas.',
      );
    }

    const unitPrice = Number(batch.price);
    const totalAmount = unitPrice * dto.quantity;
    const paymentId = `TICKET_${randomUUID()}`;

    // 3. Criar os ingressos como PENDING no banco tipados com o model do Prisma
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
          validationToken: randomUUID(), // Token único e individual para o QR Code
          paymentId: `${paymentId}_${i}`,
          paymentDeadline: new Date(Date.now() + 30 * 60 * 1000), // Expira em 30 min
        },
      });
      createdTickets.push(ticket);
    }

    // 4. Integrar com o Mercado Pago para gerar a cobrança Pix
    try {
      const mpResponse = await axios.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: totalAmount,
          description: `Compra de ${dto.quantity}x Ingresso(s) - ${batch.event.title} (${batch.name})`,
          payment_method_id: 'pix',
          payer: {
            email: dto.customerEmail || 'cliente@reservasclub.com',
            first_name: dto.customerName,
            identification: dto.customerCpf
              ? { type: 'CPF', number: dto.customerCpf }
              : undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${nightclub.mpAccessToken}`,
            'X-Idempotency-Key': paymentId,
          },
        },
      );

      const paymentData = mpResponse.data as Record<string, any>;
      const pointOfInteraction = paymentData.point_of_interaction as
        | Record<string, any>
        | undefined;
      const transactionData = pointOfInteraction?.transaction_data as
        | Record<string, any>
        | undefined;

      const qrCodePix = transactionData?.qr_code as string | undefined;
      const qrCodeBase64 = transactionData?.qr_code_base64 as
        | string
        | undefined;
      const ticketUrl = transactionData?.ticket_url as string | undefined;

      return {
        success: true,
        totalAmount,
        ticketsCount: createdTickets.length,
        paymentId,
        pix: {
          qrCode: qrCodePix,
          qrCodeBase64: qrCodeBase64,
          ticketUrl: ticketUrl,
        },
        tickets: createdTickets.map((t) => ({
          id: t.id,
          validationToken: t.validationToken,
        })),
      };
    } catch (error: unknown) {
      const err = error as { response?: { data?: any }; message?: string };
      console.error(
        'Erro ao gerar pagamento no Mercado Pago:',
        err?.response?.data || err.message,
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
      include: { event: true, batch: true },
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

    // Atualiza o status para CHECKED_IN (Check-in feito)
    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'CHECKED_IN' },
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
