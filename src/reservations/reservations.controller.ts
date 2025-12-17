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
  UseGuards, // Adicionado para proteger rotas críticas
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
// Importe seu MasterGuard se já tiver um (Exemplo: import { MasterGuard } from '../auth/master.guard';)

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
  // 4. WEBHOOK REAL (Mercado Pago - Fire and Forget)
  // ===========================================================================
  @Post('webhook')
  @HttpCode(200) // Retorna 200 para evitar reenvio do MP
  async handleWebhook(@Body() body: any, @Query() query: any) {
    const paymentId =
      body?.data?.id || body?.id || query?.id || query?.['data.id'];
    const type = body?.type || query?.topic;

    console.log('🔔 Webhook Recebido:', { paymentId, type });

    if (paymentId && (type === 'payment' || type === 'merchant_order')) {
      // Dispara o processo em background e retorna OK imediatamente.
      this.reservationsService
        .processWebhook(paymentId)
        .catch((err) =>
          console.error('Erro no processamento background:', err),
        );
    }

    return { status: 'OK' };
  }

  // ===========================================================================
  // 5. PORTARIA / CHECK-IN (Validação de Ingresso)
  // ===========================================================================
  @Post('check-in/:token')
  checkInByToken(@Param('token') token: string) {
    return this.reservationsService.checkInByToken(token);
  }

  // ===========================================================================
  // 6. SIMULAÇÃO E OBTENÇÃO DO TOKEN (Para Teste de Portaria)
  // ===========================================================================
  // Use um MasterGuard aqui para proteger esta rota em produção
  // @UseGuards(MasterGuard)

  // ===========================================================================
  // 7. GERAR PIX MANUALMENTE (Endpoint Auxiliar)
  // ===========================================================================
  @Post(':id/pix')
  generatePix(@Param('id') id: string) {
    return this.reservationsService.generatePix(id);
  }

  // ===========================================================================
  // 8. CRUD PADRÃO
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
