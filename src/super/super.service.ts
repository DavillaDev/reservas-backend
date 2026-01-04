// src/super/super.service.ts (VERSÃO FINAL COMPLETA)

import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException, // 🟢 Importante para o Reset de Senha
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { OnboardClubDto } from './dto/onboard-club.dto';
import { classToPlain } from 'class-transformer';

@Injectable()
export class SuperService {
  constructor(private prisma: PrismaService) {}

  // ===========================================================================
  // 1. DASHBOARD INTELIGENTE (Gráficos + Logs + Lista)
  // ===========================================================================
  async getDashboardData() {
    // Definir intervalo de 30 dias para o gráfico
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Executa as 3 consultas pesadas em paralelo
    const [nightclubs, chartReservations, recentLogs] = await Promise.all([
      // A. Busca Lista de Baladas e Totais Gerais
      this.prisma.nightclub.findMany({
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
      }),

      // B. Busca Dados para o Gráfico (Últimos 30 dias)
      this.prisma.reservation.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: 'CONFIRMED',
        },
        select: {
          createdAt: true,
          amount: true,
          nightclub: {
            select: { settings: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),

      // C. Busca Feed de Atividades (Últimas 10 ações)
      this.prisma.reservation.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          nightclub: { select: { name: true } },
        },
      }),
    ]);

    // --- PROCESSAMENTO DOS DADOS ---

    // 1. Processar Totais Gerais
    let totalRevenue = 0;
    let totalReservations = 0;

    const formattedClubs = nightclubs.map((club) => {
      const clubRevenue = club.reservations.reduce(
        (acc, curr) => acc + Number(curr.amount || 0),
        0,
      );
      totalRevenue += clubRevenue;
      totalReservations += club._count.reservations;

      const settings = club.settings as any;

      return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        owner: club.users[0]
          ? `${club.users[0].name} (${club.users[0].email})`
          : 'Sem Dono',
        users: club.users, // Envia lista de users para pegar o email no front
        revenue: clubRevenue,
        reservationsCount: club._count.reservations,
        createdAt: club.createdAt,
        settings: {
          appFeePercent: settings?.appFeePercent || 5,
          clubFeePercent: settings?.clubFeePercent || 95,
          openingDays: settings?.openingDays || [],
        },
      };
    });

    // 2. Processar Gráfico (Agrupar por Dia)
    const chartMap = new Map<string, { revenue: number; profit: number }>();

    // Inicializa os últimos 30 dias com zero
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      });
      chartMap.set(key, { revenue: 0, profit: 0 });
    }

    // Preenche com os dados reais do banco
    chartReservations.forEach((res) => {
      const key = new Date(res.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      });

      if (chartMap.has(key)) {
        const amount = Number(res.amount);
        const settings = res.nightclub?.settings as any;
        const fee = settings?.appFeePercent
          ? Number(settings.appFeePercent)
          : 5;
        const profit = (amount * fee) / 100;

        const current = chartMap.get(key);

        // Verificação de segurança TS
        if (current) {
          chartMap.set(key, {
            revenue: current.revenue + amount,
            profit: current.profit + profit,
          });
        }
      }
    });

    const history = Array.from(chartMap, ([name, value]) => ({
      name,
      ...value,
    }));

    // 3. Processar Logs
    const logs = recentLogs.map((log) => ({
      id: log.id,
      type: 'money',
      msg: `Reserva criada em ${log.nightclub.name}`,
      value: `R$ ${Number(log.amount).toFixed(2)}`,
      time: new Date(log.createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return {
      stats: {
        totalClubs: nightclubs.length,
        totalRevenue,
        totalReservations,
      },
      clubs: formattedClubs,
      history,
      logs,
    };
  }

  // ===========================================================================
  // 2. CRIAR CLIENTE (ONBOARDING)
  // ===========================================================================
  async onboardClient(data: OnboardClubDto) {
    const { clubName, slug, ownerName, ownerEmail, ownerPassword, settings } =
      data;

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

    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    let clubSettings: any = {};
    if (settings) {
      clubSettings = classToPlain(settings);
    }

    return this.prisma.$transaction(async (tx) => {
      const nightclub = await tx.nightclub.create({
        data: {
          name: clubName,
          slug,
          whatsapp: '',
          themeColor: '#ff8c00',
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

  // ===========================================================================
  // 3. RESETAR SENHA DO CLIENTE (ADMIN FORCE) 🔑 [NOVO]
  // ===========================================================================
  async resetClubPassword(clubId: string, newPass: string) {
    // 1. Acha a balada e o dono
    const club = await this.prisma.nightclub.findUnique({
      where: { id: clubId },
      include: { users: { where: { role: 'OWNER' } } },
    });

    if (!club || !club.users[0]) {
      throw new NotFoundException(
        'Cliente ou Dono não encontrado para esta balada.',
      );
    }

    // 2. Criptografa a nova senha
    const hashedPassword = await bcrypt.hash(newPass, 10);

    // 3. Salva a nova senha no banco
    await this.prisma.user.update({
      where: { id: club.users[0].id },
      data: { password: hashedPassword },
    });

    return { message: 'Senha redefinida com sucesso.' };
  }
}
