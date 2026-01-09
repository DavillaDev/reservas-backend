import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { OnboardClubDto } from './dto/onboard-club.dto';
import { classToPlain } from 'class-transformer';
import { JwtService } from '@nestjs/jwt'; // 👈 Adicionado

@Injectable()
export class SuperService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService, // 👈 Injetado para o Super Poder
  ) {}

  // ===========================================================================
  // 1. DASHBOARD INTELIGENTE (Gráficos + Logs + Lista)
  // ===========================================================================
  async getDashboardData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [nightclubs, chartReservations, recentLogs] = await Promise.all([
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

      this.prisma.reservation.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          nightclub: { select: { name: true } },
        },
      }),
    ]);

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
        users: club.users,
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

    const chartMap = new Map<string, { revenue: number; profit: number }>();

    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      });
      chartMap.set(key, { revenue: 0, profit: 0 });
    }

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
  // 3. RESETAR SENHA DO CLIENTE (ADMIN FORCE) 🔑
  // ===========================================================================
  async resetClubPassword(clubId: string, newPass: string) {
    const club = await this.prisma.nightclub.findUnique({
      where: { id: clubId },
      include: { users: { where: { role: UserRole.OWNER } } },
    });

    if (!club || !club.users[0]) {
      throw new NotFoundException('Cliente ou Dono não encontrado.');
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);

    await this.prisma.user.update({
      where: { id: club.users[0].id },
      data: { password: hashedPassword },
    });

    return { message: 'Senha redefinida com sucesso.' };
  }

  // ===========================================================================
  // 4. IMPERSONATE (LOGIN DIRETO) 🚀 [SUPER PODER]
  // ===========================================================================
  async generateImpersonateToken(nightclubId: string) {
    // 1. Busca o primeiro usuário administrador (OWNER) dessa balada
    const user = await this.prisma.user.findFirst({
      where: { nightclubId, role: UserRole.OWNER },
    });

    if (!user) {
      throw new NotFoundException('Nenhum usuário proprietário encontrado.');
    }

    // 2. Cria o Payload idêntico ao do AuthService original
    const payload = {
      email: user.email,
      sub: user.id,
      nightclubId: user.nightclubId,
      role: user.role,
    };

    // 3. Assina o token com o JwtService
    return this.jwtService.sign(payload);
  }
}
