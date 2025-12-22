// src/super/super.service.ts (FINAL E CORRIGIDO PARA ONBOARDING DE CONFIGURAÇÕES)

import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
// 🔑 NOVA IMPORTAÇÃO: O DTO de Onboarding
import { OnboardClubDto } from './dto/onboard-club.dto';
import { classToPlain } from 'class-transformer'; // 🔑 Importar para lidar com Prisma JSON

@Injectable()
export class SuperService {
  constructor(private prisma: PrismaService) {} // 1. DASHBOARD GERAL

  async getDashboardData() {
    const nightclubs = await this.prisma.nightclub.findMany({
      include: {
        _count: { select: { reservations: true } },
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { amount: true },
        },
        users: {
          where: { role: 'OWNER' },
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalRevenue = 0;
    let totalReservations = 0;

    const formattedClubs = nightclubs.map((club) => {
      const clubRevenue = club.reservations.reduce(
        (acc, curr) => acc + Number(curr.amount || 0),
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
  } // 2. CRIAR CLIENTE (ONBOARDING)

  async onboardClient(data: OnboardClubDto) {
    // 🔑 1. Desestruturamos incluindo o campo settings
    const { clubName, slug, ownerName, ownerEmail, ownerPassword, settings } =
      data;

    // As validações de DTO garantem que os campos estão presentes, eliminando
    // a necessidade da validação manual de 'Payload inválido' e 'Dados obrigatórios ausentes'

    const existingUser = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });

    if (existingUser) {
      throw new ConflictException('Já existe um usuário com esse email.');
    }

    const existingClub = await this.prisma.nightclub.findUnique({
      where: { slug },
    });

    if (existingClub) {
      throw new ConflictException('Já existe uma balada com esse slug/link.');
    }

    const hashedPassword = await bcrypt.hash(ownerPassword, 10); // 🔑 2. Preparamos o objeto 'settings' para o Prisma

    let clubSettings: any = {};
    if (settings) {
      // Usa classToPlain para transformar a instância do DTO em um objeto JSON puro
      clubSettings = classToPlain(settings);
    }

    return this.prisma.$transaction(async (tx) => {
      const nightclub = await tx.nightclub.create({
        data: {
          name: clubName,
          slug,
          whatsapp: '',
          themeColor: '#ff8c00', // 🔑 3. Incluímos as configurações de Split/JSON
          settings: clubSettings,
        },
      });

      const user = await tx.user.create({
        data: {
          email: ownerEmail,
          name: ownerName || 'Admin',
          password: hashedPassword,
          role: UserRole.OWNER,
          nightclubId: nightclub.id,
        },
      });

      return { nightclub, user };
    });
  }
}
