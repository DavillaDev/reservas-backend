// src/reservations/reservations.controller.ts
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
  UseGuards,
  Request,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  // ===========================================================================
  // 1. PÚBLICO: Criar Reserva (Site/Checkout do Cliente)
  // ===========================================================================
  @Post()
  create(@Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.create(createReservationDto);
  }

  // ===========================================================================
  // 1.5 PÚBLICO: Checar Disponibilidade (Para o Mapa ficar Cinza) 🚨 NOVO!
  // ===========================================================================
  @Get('availability')
  async checkAvailability(
    @Query('nightclubId') nightclubId: string,
    @Query('date') date: string,
  ) {
    // Retorna lista de IDs das mesas ocupadas ['uuid-1', 'uuid-2']
    return this.reservationsService.getBookedSpaces(nightclubId, date);
  }

  // ===========================================================================
  // 2. PRIVADO: Listar Reservas (Dashboard Admin)
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query('date') date: string, @Request() req: any) {
    // 🛡️ Segurança: Ignoramos qualquer ID vindo da query e usamos o do TOKEN
    const nightclubId = req.user.nightclubId;
    return this.reservationsService.findAll(date, nightclubId);
  }

  // ===========================================================================
  // 3. PÚBLICO: Dados de Checkout (Tela de Pagamento)
  // ===========================================================================
  @Get(':id/checkout')
  async getCheckoutData(@Param('id') id: string) {
    return this.reservationsService.getCheckoutData(id);
  }

  // ===========================================================================
  // 4. PÚBLICO: Webhook Mercado Pago
  // ===========================================================================
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: any, @Query() query: any) {
    const paymentId =
      body?.data?.id || body?.id || query?.id || query?.['data.id'];
    const action = body?.action || body?.type || query?.topic;

    if (paymentId && (action === 'payment' || action?.includes('payment'))) {
      this.reservationsService
        .processWebhook(paymentId.toString())
        .catch(console.error);
    }
    return { status: 'received' };
  }

  // ===========================================================================
  // 5. PRIVADO: Portaria (Check-in via QR Code)
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Post('check-in/:token')
  checkInByToken(@Param('token') token: string) {
    return this.reservationsService.checkInByToken(token);
  }

  // ===========================================================================
  // 6. CRUD PRIVADO: Blindado contra acesso cruzado (Multi-tenancy)
  // ===========================================================================

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const res = await this.reservationsService.findOne(id);

    if (!res) throw new NotFoundException('Reserva não encontrada.');

    if (res.nightclubId !== req.user.nightclubId) {
      throw new UnauthorizedException('Acesso negado a esta reserva.');
    }
    return res;
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
    @Request() req: any,
  ) {
    const res = await this.reservationsService.findOne(id);

    if (!res) throw new NotFoundException('Reserva não encontrada.');

    if (res.nightclubId !== req.user.nightclubId) {
      throw new UnauthorizedException(
        'Você não tem permissão para editar esta reserva.',
      );
    }
    return this.reservationsService.update(id, updateReservationDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const res = await this.reservationsService.findOne(id);

    if (!res) throw new NotFoundException('Reserva não encontrada.');

    if (res.nightclubId !== req.user.nightclubId) {
      throw new UnauthorizedException(
        'Você não tem permissão para excluir esta reserva.',
      );
    }
    return this.reservationsService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pix')
  async generatePix(@Param('id') id: string, @Request() req: any) {
    const res = await this.reservationsService.findOne(id);
    if (!res || res.nightclubId !== req.user.nightclubId) {
      throw new UnauthorizedException('Ação não permitida.');
    }
    return this.reservationsService.generatePix(id);
  }
}
