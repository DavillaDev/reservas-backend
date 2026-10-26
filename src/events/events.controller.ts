// src/events/events.controller.ts
import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createEvent(@Body() dto: CreateEventDto & { nightclubId: string }) {
    const { nightclubId, ...eventData } = dto;
    return this.eventsService.createEvent(nightclubId, eventData);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':eventId/batches')
  async createBatch(
    @Param('eventId') eventId: string,
    @Body() dto: CreateBatchDto,
  ) {
    return this.eventsService.createBatch(eventId, dto);
  }

  @Get('nightclub/:nightclubId')
  async findAllByNightclub(@Param('nightclubId') nightclubId: string) {
    return this.eventsService.findAllByNightclub(nightclubId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }
}
