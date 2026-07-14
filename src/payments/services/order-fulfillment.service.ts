import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service'; // Ajuste o caminho se necessário
import { MailService } from '../../mail/mail.service'; // Ajuste o caminho se necessário
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
      } else {
        this.logger.log(
          `ℹ️ [COMISSÃO] Ignorada (Reserva Gratuita) para o promoter ${promoter.name}`,
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

    // 🚀 DISPARO DE AÇÕES PÓS-VENDA (Assíncronas para não travar o fluxo)
    this.executePostFulfillmentActions(updated);

    return updated;
  }

  // ===========================================================================
  // 2. AÇÕES PÓS-VENDA (E-mail, Push, WhatsApp)
  // ===========================================================================
  private executePostFulfillmentActions(reservation: any) {
    // 📧 Envia E-mail para o Cliente
    if (reservation.customerEmail) {
      this.mailService
        .sendReservationConfirmation(reservation, reservation.nightclub.name)
        .catch((err) =>
          this.logger.error('Erro ao enviar e-mail:', err.message),
        );
    }

    // 🔔 Envia Push Notification para o App do Dono/Gerente
    this.notificationsService
      .notifyNewReservation(reservation.nightclubId, {
        id: reservation.id,
        customerName: reservation.customerName,
        spaceName: reservation.space.name,
      })
      .catch((err) => this.logger.error('Erro ao enviar Push:', err.message));

    // 📲 Dispara o Ingresso via WhatsApp (IA)
    this.dispararIngressoWhatsapp(reservation).catch((err) =>
      this.logger.error('❌ Erro no Ingresso WhatsApp:', err.message),
    );
  }

  // ===========================================================================
  // 3. INTEGRAÇÃO WHATSAPP IA
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
        `📲 [WhatsApp] Ingresso (Link Checkout) enviado para ${reservation.customerPhone}`,
      );
    } catch (error: any) {
      this.logger.error(
        'Falha ao disparar ingresso automático via WhatsApp:',
        error.message,
      );
    }
  }
}
