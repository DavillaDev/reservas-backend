import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
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
  // 1.5 PÚBLICO: Checar Disponibilidade (Para o Mapa ficar Cinza)
  // ===========================================================================
  @Get('availability')
  async checkAvailability(
    @Query('nightclubId') nightclubId: string,
    @Query('date') date: string,
  ) {
    return this.reservationsService.getBookedSpaces(nightclubId, date);
  }

  // ===========================================================================
  // 2. PRIVADO: Listar Reservas (Dashboard Admin e Promoter)
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Query('date') date: string,
    @Query('promoterId') promoterId: string, // 👈 1. Agora ele captura o ID que o front envia!
    @Request() req: any,
  ) {
    // 🛡️ Segurança: Ignoramos o nightclubId vindo da query e usamos o do TOKEN
    const nightclubId = req.user.nightclubId;

    // 👈 2. Repassamos o promoterId como 3º argumento para o Service filtrar
    return this.reservationsService.findAll(date, nightclubId, promoterId);
  }

  // ===========================================================================
  // 3. PRIVADO: Portaria (Check-in via QR Code)
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Post('check-in/:token')
  checkInByToken(@Param('token') token: string) {
    return this.reservationsService.checkInByToken(token);
  }

  // ===========================================================================
  // 4. CRUD PRIVADO: Blindado contra acesso cruzado (Multi-tenancy)
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
}
