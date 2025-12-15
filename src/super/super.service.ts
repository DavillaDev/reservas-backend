import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SuperService {
  constructor(private prisma: PrismaService) {}

  // 1. DASHBOARD GERAL (Novo)
  async getDashboardData() {
    // Busca todas as baladas e suas reservas
    const nightclubs = await this.prisma.nightclub.findMany({
      include: {
        _count: { select: { reservations: true } }, // Conta reservas
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { amount: true }, // Pega valor pra somar
        },
        users: {
          where: { role: 'OWNER' },
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcula Totais Globais
    let totalRevenue = 0;
    let totalReservations = 0;

    const formattedClubs = nightclubs.map((club) => {
      const clubRevenue = club.reservations.reduce(
        (acc, curr) => acc + (Number(curr.amount) || 0),
        0,
      );

      totalRevenue += clubRevenue;
      totalReservations += club._count.reservations;

      return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        owner: club.users[0]
          ? `${club.users[0].name} (${club.users[0].email})`
          : 'Sem Dono',
          users: club.users,
        revenue: clubRevenue,
        reservationsCount: club._count.reservations,
        createdAt: club.createdAt,
      };
    });

    return {
      stats: {
        totalClubs: nightclubs.length,
        totalRevenue,
        totalReservations,
      },
      clubs: formattedClubs,
    };
  }

  // 2. CRIAR CLIENTE (O que já existia)
  async onboardClient(data: any) {
    const { clubName, slug, ownerName, ownerEmail, ownerPassword } = data;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (existingUser)
      throw new ConflictException('Já existe um usuário com esse email.');

    const existingClub = await this.prisma.nightclub.findUnique({
      where: { slug },
    });
    if (existingClub)
      throw new ConflictException('Já existe uma balada com esse slug/link.');

    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const nightclub = await tx.nightclub.create({
        data: {
          name: clubName,
          slug: slug,
          whatsapp: '',
          themeColor: '#ff8c00',
        },
      });

      const user = await tx.user.create({
        data: {
          email: ownerEmail,
          name: ownerName,
          password: hashedPassword,
          role: UserRole.OWNER,
          nightclubId: nightclub.id,
        },
      });

      return { nightclub, user };
    });
  }
}
