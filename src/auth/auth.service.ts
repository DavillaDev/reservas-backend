import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CommissionType } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // 🔐 Realiza o Login e injeta os metadados da balada na sessão
  async login(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { nightclub: true },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const isMatch = await bcrypt.compare(pass, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      nightclubId: user.nightclubId,
      nightclubSlug: user.nightclub?.slug,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        nightclubId: user.nightclubId,
        nightclubName: user.nightclub?.name,
        nightclubSlug: user.nightclub?.slug,
      },
    };
  }

  // 🛡️ Cadastra membros da equipe com suporte a comissões customizadas para Promoters
  async registerTeamMember(data: {
    name: string;
    email: string;
    password: string;
    nightclubId: string;
    role: 'STAFF' | 'MANAGER' | 'PROMOTER';
    commissionType?: 'FIXED' | 'PERCENTAGE';
    commissionValue?: number;
  }) {
    if (
      data.role !== 'STAFF' &&
      data.role !== 'MANAGER' &&
      data.role !== 'PROMOTER'
    ) {
      throw new BadRequestException(
        'Nível de acesso inválido ou não autorizado.',
      );
    }

    const userExists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new ConflictException('Este e-mail já está cadastrado no sistema.');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(data.password, salt);

    // Salva o usuário aplicando a regra de negócio financeira se for promoter
    const newUser = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        nightclubId: data.nightclubId,
        commissionType:
          data.role === 'PROMOTER'
            ? (data.commissionType as CommissionType)
            : 'FIXED',
        commissionValue:
          data.role === 'PROMOTER' ? data.commissionValue || 0 : 0,
      },
    });

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      nightclubId: newUser.nightclubId,
    };
  }

  // 📊 Central de Comando: Busca equipe agregando métricas operacionais e financeiras em tempo real
  async getTeam(nightclubId: string) {
    const members = await this.prisma.user.findMany({
      where: {
        nightclubId: nightclubId,
        role: { in: ['MANAGER', 'STAFF', 'PROMOTER'] },
      },
      include: {
        promotedReservations: true, // Puxa o histórico de indicações para fazermos a agregação
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Mapeia os dados transformando o retorno em um painel rico de auditoria
    return members.map((user) => {
      let totalVendas = 0;
      let comissaoPendente = 0;
      let totalBipados = 0;

      if (user.role === 'PROMOTER') {
        // Vendas totais: Conta todas as reservas feitas pelo link dele que NÃO foram canceladas
        totalVendas = user.promotedReservations.filter(
          (res) => res.status !== 'CANCELED',
        ).length;

        // Comissão Pendente: Soma apenas os valores de reservas já APROVADAS (ex: cliente compareceu) que ainda não foram pagas
        comissaoPendente = user.promotedReservations
          .filter((res) => res.commissionStatus === 'APPROVED')
          .reduce((sum, res) => sum + Number(res.commissionAmount || 0), 0);
      }

      if (user.role === 'STAFF') {
        // 💡 Como o banco não vincula qual staff bipou individualmente (apenas salva o status global da mesa),
        // podemos deixar um contador zerado ou retornar o total da casa. Retornamos 0 por padrão para auditoria futura.
        totalBipados = 0;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        commissionType: user.commissionType,
        commissionValue: Number(user.commissionValue),
        totalVendas,
        comissaoPendente,
        totalBipados,
      };
    });
  }

  // 💰 Sistema de Baixa: Quita as comissões prontas de um promoter específico
  async payPromoterCommissions(promoterId: string) {
    const promoter = await this.prisma.user.findUnique({
      where: { id: promoterId },
    });

    if (!promoter || promoter.role !== 'PROMOTER') {
      throw new BadRequestException('Usuário inválido ou não é um promoter.');
    }

    // Altera o status financeiro de APPROVED (Liberado) para PAID (Pago)
    const updateResult = await this.prisma.reservation.updateMany({
      where: {
        promoterId: promoterId,
        commissionStatus: 'APPROVED',
      },
      data: {
        commissionStatus: 'PAID',
      },
    });

    return {
      success: true,
      message: `Baixa realizada com sucesso para ${promoter.name}.`,
      liquidatedReservations: updateResult.count,
    };
  }

  // 🛡️ Remove um colaborador do sistema
  async deleteTeamMember(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.role === 'OWNER') {
      throw new BadRequestException('Não é possível remover a conta do Dono.');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'Acesso revogado com sucesso.' };
  }
}
