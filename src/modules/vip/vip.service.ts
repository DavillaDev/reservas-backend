import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class VipService {
  constructor(private prisma: PrismaService) {}

  // 1. GERAR NOVO TOKEN
  async createToken(nightclubId: string, maxGuests: number, expiresAt: Date) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const code = `VIP-${randomPart}`;

    const exists = await this.prisma.vipToken.findUnique({ where: { code } });
    if (exists) return this.createToken(nightclubId, maxGuests, expiresAt);

    return this.prisma.vipToken.create({
      data: {
        code,
        nightclubId,
        maxGuests,
        expiresAt,
        isActive: true,
      },
    });
  }

  // 2. ADICIONAR NOME NA LISTA (GUEST)
  async addGuest(code: string, guestName: string, guestPhone?: string) {
    const token = await this.prisma.vipToken.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!token || !token.isActive) {
      throw new NotFoundException('Lista VIP não encontrada ou inativa.');
    }

    if (new Date() > token.expiresAt) {
      throw new BadRequestException('Esta lista já expirou.');
    }

    if (token.currentCount >= token.maxGuests) {
      throw new BadRequestException('Limite da lista atingido.');
    }

    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.vipGuest.create({
        data: {
          vipTokenId: token.id,
          name: guestName,
          phone: guestPhone,
          validationToken: uuidv4(),
        },
      });

      await tx.vipToken.update({
        where: { id: token.id },
        data: { currentCount: { increment: 1 } },
      });

      return guest;
    });
  }

  // 3. LISTAR TOKENS COM CONVIDADOS (PARA LOG E DASHBOARD)
  async getTokensByNightclub(nightclubId: string) {
    return this.prisma.vipToken.findMany({
      where: { nightclubId },
      include: {
        guests: {
          select: {
            id: true,
            name: true,
            validationToken: true, // 👈 Importante para o seu teste de log
            status: true,
            createdAt: true,
          },
        },
        _count: { select: { guests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 4. EXCLUIR LINK VIP E SEUS CONVIDADOS
  async removeToken(tokenId: string) {
    // Primeiro removemos os convidados (por causa da constraint do banco)
    await this.prisma.vipGuest.deleteMany({
      where: { vipTokenId: tokenId },
    });

    return this.prisma.vipToken.delete({
      where: { id: tokenId },
    });
  }

  async getGuestsByToken(tokenId: string) {
    return this.prisma.vipGuest.findMany({
      where: { vipTokenId: tokenId },
      orderBy: { name: 'asc' },
    });
  }
}
