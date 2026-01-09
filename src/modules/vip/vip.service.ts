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

  // ===========================================================================
  // 1. GERAR NOVO TOKEN (O DONO CLICA NO BOTÃO)
  // ===========================================================================
  async createToken(nightclubId: string, maxGuests: number, expiresAt: Date) {
    // Gerador de código curto e amigável (VIP-XXXX)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removido I, O, 0, 1 para evitar confusão
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const code = `VIP-${randomPart}`;

    // Garante que o código é único
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

  // ===========================================================================
  // 2. ADICIONAR NOME NA LISTA (O CLIENTE USA O LINK E GERA QR CODE)
  // ===========================================================================
  async addGuest(code: string, guestName: string, guestPhone?: string) {
    const token = await this.prisma.vipToken.findUnique({
      where: { code },
      include: { guests: true },
    });

    if (!token || !token.isActive) {
      throw new NotFoundException(
        'Esta lista VIP não existe ou foi desativada.',
      );
    }

    if (new Date() > token.expiresAt) {
      throw new BadRequestException('O prazo para entrar nesta lista expirou.');
    }

    if (token.currentCount >= token.maxGuests) {
      throw new BadRequestException(
        'Esta lista VIP já atingiu o limite de nomes.',
      );
    }

    // Criar o convidado com validationToken e atualizar contador em transação
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.vipGuest.create({
        data: {
          vipTokenId: token.id,
          name: guestName,
          phone: guestPhone,
          // 🔑 Este token é o valor que estará no QR CODE
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

  // ===========================================================================
  // 3. LISTAR TOKENS DA BALADA (PARA O DASHBOARD DO DONO)
  // ===========================================================================
  async getTokensByNightclub(nightclubId: string) {
    return this.prisma.vipToken.findMany({
      where: { nightclubId },
      include: {
        _count: { select: { guests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 4. LISTAR CONVIDADOS DE UM TOKEN (PARA A PORTARIA)
  // ===========================================================================
  async getGuestsByToken(tokenId: string) {
    return this.prisma.vipGuest.findMany({
      where: { vipTokenId: tokenId },
      orderBy: { name: 'asc' },
    });
  }
}
