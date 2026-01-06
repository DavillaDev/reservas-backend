import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  // 1. Lista apenas clientes que já frequentaram a balada específica
  async findAllByNightclub(nightclubId: string) {
    return this.prisma.customer.findMany({
      where: {
        reservations: {
          some: { nightclubId: nightclubId },
        },
      },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { reservations: true }, // Mostra quantas vezes ele já foi!
        },
      },
    });
  }

  // 2. Busca um cliente específico (para detalhes)
  async findOne(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: { reservations: { take: 5, orderBy: { date: 'desc' } } },
    });
  }

  // 3. 🚨 O BOTÃO VERMELHO (Toggle Block)
  async toggleBlock(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { isBlocked: !customer.isBlocked }, // Inverte: se tava livre, bloqueia.
    });
  }
}
