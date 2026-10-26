import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async createEvent(nightclubId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        nightclubId,
        title: dto.title,
        description: dto.description,
        bannerUrl: dto.bannerUrl,
        eventDate: new Date(dto.eventDate),
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
    return this.prisma.event.findMany({
      where: { nightclubId },
      include: {
        batches: true,
      },
      orderBy: { eventDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        batches: true,
        tickets: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    return event;
  }
}
