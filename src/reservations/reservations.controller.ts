import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  // ===========================================================================
  // 1. CRIAR NOVA RESERVA
  // ===========================================================================
  @Post()
  create(@Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.create(createReservationDto);
  }

  // ===========================================================================
  // 2. LISTAR TODAS (Dashboard & Filtros)
  // ===========================================================================
  @Get()
  findAll(
    @Query('date') date?: string,
    @Query('nightclubId') nightclubId?: string,
  ) {
    return this.reservationsService.findAll(date, nightclubId);
  }

  // ===========================================================================
  // 3. CHECKOUT (Alimenta a tela de pagamento)
  // ===========================================================================
  @Get(':id/checkout')
  async getCheckoutData(@Param('id') id: string) {
    return this.reservationsService.getCheckoutData(id);
  }

  // ===========================================================================
  // 4. WEBHOOK REAL (Mercado Pago - Blindado)
  // ===========================================================================
  @Post('webhook')
  @HttpCode(200) // MP exige 200 ou 201 para parar de reenviar
  async handleWebhook(@Body() body: any, @Query() query: any) {
    // O MP pode enviar o ID em diferentes lugares dependendo da versão da API
    const paymentId =
      body?.data?.id || body?.id || query?.id || query?.['data.id'];

    const action = body?.action || body?.type || query?.topic;

    console.log('🔔 [WEBHOOK] Recebido:', { paymentId, action });

    // Verificamos se é uma notificação de pagamento aprovado ou criado
    if (
      paymentId &&
      (action === 'payment' ||
        action === 'payment.created' ||
        action === 'payment.updated')
    ) {
      // Executa em background para não travar a resposta do MP
      this.reservationsService
        .processWebhook(paymentId.toString())
        .catch((err) =>
          console.error(
            '❌ [WEBHOOK_ERROR] Erro no processamento:',
            err.message,
          ),
        );
    }

    return { status: 'received' };
  }

  // ===========================================================================
  // 5. PORTARIA / CHECK-IN (Validação de Ingresso via QR Code)
  // ===========================================================================
  @Post('check-in/:token')
  checkInByToken(@Param('token') token: string) {
    return this.reservationsService.checkInByToken(token);
  }

  // ===========================================================================
  // 6. GERAR PIX MANUALMENTE (Endpoint Auxiliar)
  // ===========================================================================
  @Post(':id/pix')
  generatePix(@Param('id') id: string) {
    return this.reservationsService.generatePix(id);
  }

  // ===========================================================================
  // 7. CRUD PADRÃO
  // ===========================================================================
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reservationsService.remove(id);
  }
}
