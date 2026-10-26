import { Controller, Post, Body } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('buy')
  async buyTickets(@Body() dto: CreateTicketDto) {
    return this.ticketsService.createTickets(dto);
  }

  @Post('validate')
  async validateTicket(@Body('validationToken') validationToken: string) {
    return this.ticketsService.validateTicket(validationToken);
  }
}
