// src/events/tickets.controller.ts

import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
// Ajuste o caminho do seu JwtAuthGuard conforme o projeto
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('buy')
  async buyTickets(@Body() dto: CreateTicketDto) {
    return this.ticketsService.createTickets(dto);
  }

  // Suporte via Body (legado/atual)
  @Post('validate')
  async validateTicket(@Body('validationToken') validationToken: string) {
    return this.ticketsService.validateTicket(validationToken);
  }

  // Suporte via Parâmetro na URL (Padrão idêntico ao check-in de reservas)
  // @UseGuards(JwtAuthGuard) // Descomente caso sua rota exija autenticação de staff
  @Post('check-in/:token')
  async validateTicketParam(@Param('token') token: string) {
    return this.ticketsService.validateTicket(token);
  }
}
