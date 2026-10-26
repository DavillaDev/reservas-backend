// src/events/events.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateBatchDto } from './dto/create-batch.dto';

interface EventWithBatches {
  id: string;
  nightclubId: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  eventDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  batches?: Array<{
    id: string;
    eventId: string;
    name: string;
    price: number;
    totalQuantity: number;
    soldQuantity: number;
    isActive: boolean;
  }>;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async createEvent(
    nightclubId: string,
    dto: CreateEventDto & { date?: string },
  ) {
    const rawDate = dto.eventDate || dto.date;

    return this.prisma.event.create({
      data: {
        nightclubId,
        title: dto.title,
        description: dto.description,
        bannerUrl: dto.bannerUrl,
        eventDate: rawDate ? new Date(rawDate) : new Date(),
      },
    });
  }

  async createBatch(eventId: string, dto: CreateBatchDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    return this.prisma.ticketBatch.create({
      data: {
        eventId,
        name: dto.name,
        price: dto.price,
        totalQuantity: dto.totalQuantity,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllByNightclub(nightclubId: string) {
    const events = (await this.prisma.event.findMany({
      where: { nightclubId },
      include: {
        batches: true,
      },
      orderBy: { eventDate: 'asc' },
    })) as unknown as EventWithBatches[];

    return events.map((ev) => ({
      ...ev,
      date: ev.eventDate,
      eventDate: ev.eventDate,
      batches: ev.batches || [],
    }));
  }

  async findOne(id: string) {
    const event = (await this.prisma.event.findUnique({
      where: { id },
      include: {
        batches: true,
        tickets: true,
      },
    })) as unknown as EventWithBatches | null;

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    return {
      ...event,
      date: event.eventDate,
      batches: event.batches || [],
    };
  }

  async remove(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    return this.prisma.event.delete({
      where: { id },
    });
  }
}
