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
  ParseUUIDPipe, // 👈 O "Segurança de Porta" nativo do NestJS
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ===========================================================================
  // 1. ROTA DE CHECKOUT (Chamada pelo Frontend para Reservas)
  // ===========================================================================
  @Get("checkout/:id")
  async getCheckoutData(
    // 🛡️ Blindagem: Só aceita acessar o checkout se for um UUID válido
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.paymentsService.getCheckoutData(id);
  }

  // ===========================================================================
  // 1.5. ROTA PARA A IA: GERAR PIX DIRETO
  // ===========================================================================
  @Post("generate-pix")
  @HttpCode(HttpStatus.OK)
  async generatePixForAI(
    // 🛡️  Se a IA enviar um ID quebrado, o NestJS barra automaticamente
    @Body("reservationId", new ParseUUIDPipe({ version: "4" }))
    reservationId: string,
    @Headers("x-internal-key") internalKey: string,
  ) {
    const masterKey = process.env.INTERNAL_SERVICE_KEY;

    if (!internalKey || internalKey !== masterKey) {
      throw new UnauthorizedException("Chave de serviço inválida.");
    }

    return this.paymentsService.generatePix(reservationId);
  }

  // ===========================================================================
  // 2. ROTA DE UPGRADE PREMIUM (Chamada pelo Frontend para Planos)
  // ===========================================================================
  @Post("upgrade")
  @HttpCode(HttpStatus.OK)
  async createPremiumUpgrade(
    // 🛡️ Blindagem: O ID da balada também precisa ser UUID
    @Body("nightclubId", new ParseUUIDPipe({ version: "4" }))
    nightclubId: string,
  ) {
    return this.paymentsService.createPremiumPreference(nightclubId);
  }

  // ===========================================================================
  // 3. ROTA DE WEBHOOK (Chamada pelo Mercado Pago)
  // ===========================================================================
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any, @Query() query: any) {
    const paymentId = body?.data?.id || query?.["data.id"] || query?.id;

    if (paymentId) {
      // 🛡️ Executa em background (sem await) para liberar o Mercado Pago rapidamente
      this.paymentsService.processWebhook(paymentId.toString()).catch((err) => {
        console.error(
          "❌ Erro no processamento assíncrono do Webhook:",
          err.message,
        );
      });
    }

    // Retorna OK imediatamente para o MP
    return { status: "success", message: "Notificação recebida" };
  }
}
