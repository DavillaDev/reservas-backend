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
  ParseUUIDPipe,
} from '@nestjs/common';
import { CheckoutService } from './services/checkout.service';
import { WebhookService } from './services/webhook.service';

@Controller('payments')
export class PaymentsController {
  // 🔌 Injetando os novos serviços separados!
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly webhookService: WebhookService,
  ) {}

  // ===========================================================================
  // 1. ROTA DE CHECKOUT (Chamada pelo Frontend para Reservas)
  // ===========================================================================
  @Get('checkout/:id')
  async getCheckoutData(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.checkoutService.getCheckoutData(id);
  }

  // ===========================================================================
  // 1.5. ROTA PARA A IA: GERAR PIX DIRETO
  // ===========================================================================
  @Post('generate-pix')
  @HttpCode(HttpStatus.OK)
  async generatePixForAI(
    @Body('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Headers('x-internal-key') internalKey: string,
  ) {
    const masterKey = process.env.INTERNAL_SERVICE_KEY;

    if (!internalKey || internalKey !== masterKey) {
      throw new UnauthorizedException('Chave de serviço inválida.');
    }

    return this.checkoutService.generatePix(reservationId);
  }

  // ===========================================================================
  // 2. ROTA DE UPGRADE PREMIUM (Chamada pelo Frontend para Planos)
  // ===========================================================================
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  async createPremiumUpgrade(
    @Body('nightclubId', new ParseUUIDPipe({ version: '4' }))
    nightclubId: string,
  ) {
    return this.checkoutService.createPremiumPreference(nightclubId);
  }

  // ===========================================================================
  // 3. ROTA DE WEBHOOK (Chamada pelo Mercado Pago)
  // ===========================================================================
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any, @Query() query: any) {
    const paymentId = body?.data?.id || query?.['data.id'] || query?.id;

    if (paymentId) {
      // 🛡️ Manda o WebhookService processar em background
      this.webhookService.processWebhook(paymentId.toString()).catch((err) => {
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
