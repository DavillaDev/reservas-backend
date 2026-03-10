import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ===========================================================================
  // 1. ROTA DE CHECKOUT (Chamada pelo Frontend para Reservas)
  // ===========================================================================
  @Get('checkout/:id')
  async getCheckoutData(@Param('id') id: string) {
    return this.paymentsService.getCheckoutData(id);
  }

  // ===========================================================================
  // 2. ROTA DE UPGRADE PREMIUM (Chamada pelo Frontend para Planos)
  // ===========================================================================
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  async createPremiumUpgrade(@Body('nightclubId') nightclubId: string) {
    return this.paymentsService.createPremiumPreference(nightclubId);
  }

  // ===========================================================================
  // 3. ROTA DE WEBHOOK (Chamada pelo Mercado Pago)
  // ===========================================================================
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any, @Query() query: any) {
    // O Mercado Pago pode enviar o ID do pagamento no Body (v1) ou na Query URL (v2)
    const paymentId = body?.data?.id || query?.['data.id'] || query?.id;

    if (paymentId) {
      // 🛡️ Executa em background (sem await) para liberar o Mercado Pago rapidamente
      // e evitar que ele fique reenviando notificações repetidas por timeout.
      this.paymentsService.processWebhook(paymentId.toString()).catch((err) => {
        console.error(
          '❌ Erro no processamento assíncrono do Webhook:',
          err.message,
        );
      });
    }

    // Retorna OK imediatamente para o MP
    return { status: 'success', message: 'Notificação recebida' };
  }
}
