import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
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
  // 1.5. ROTA PARA A IA: GERAR PIX DIRETO 🚀 [O ELO PERDIDO]
  // ===========================================================================
  @Post('generate-pix')
  @HttpCode(HttpStatus.OK)
  async generatePixForAI(
    @Body('reservationId') reservationId: string,
    @Headers('x-internal-key') internalKey: string,
  ) {
    const masterKey = process.env.INTERNAL_SERVICE_KEY;

    if (!internalKey || internalKey !== masterKey) {
      throw new UnauthorizedException('Chave de serviço inválida.');
    }

    // Chama o service que você já tem pronto e completo!
    return this.paymentsService.generatePix(reservationId);
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
    const paymentId = body?.data?.id || query?.['data.id'] || query?.id;

    if (paymentId) {
      this.paymentsService.processWebhook(paymentId.toString()).catch((err) => {
        console.error(
          '❌ Erro no processamento assíncrono do Webhook:',
          err.message,
        );
      });
    }

    return { status: 'success', message: 'Notificação recebida' };
  }
}
