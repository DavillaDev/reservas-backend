// src/events/events.module.ts

import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [EventsController, TicketsController],
  providers: [EventsService, TicketsService],
  exports: [EventsService, TicketsService],
})
export class EventsModule {}
