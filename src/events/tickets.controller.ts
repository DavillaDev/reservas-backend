// src/events/tickets.controller.ts

import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('buy')
  async buyTickets(@Body() dto: CreateTicketDto) {
    return this.ticketsService.createTickets(dto);
  }

  // Rota para buscar os dados do checkout/Pix do ingresso
  @Get('checkout/:paymentId')
  async getCheckout(@Param('paymentId') paymentId: string) {
    return this.ticketsService.getCheckoutData(paymentId);
  }

  // 📊 NOVO: Rota para o Dashboard listar os ingressos vendidos por Evento
  @Get('event/:eventId')
  async getTicketsByEvent(@Param('eventId') eventId: string) {
    return this.ticketsService.getTicketsByEvent(eventId);
  }

  // Suporte via Body (legado/atual)
  @Post('validate')
  async validateTicket(@Body('validationToken') validationToken: string) {
    return this.ticketsService.validateTicket(validationToken);
  }

  // Suporte via Parâmetro na URL (Padrão idêntico ao check-in de reservas)
  @Post('check-in/:token')
  async validateTicketParam(@Param('token') token: string) {
    return this.ticketsService.validateTicket(token);
  }
}
