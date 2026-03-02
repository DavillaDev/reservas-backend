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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // Agora recebe email e senha separadamente para facilitar
  async login(email: string, pass: string) {
    // 1. Busca na tabela USER (A nova tabela de login)
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { nightclub: true }, // Traz dados da balada junto
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // 2. Verifica a senha usando BCrypt
    const isMatch = await bcrypt.compare(pass, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // 3. Gera o Token (O Crachá VIP)
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
      },
    };
  }

  // 🛡️ MÉTODO ATUALIZADO: Criação de Membros da Equipe (Portaria ou Gerente)
  async registerTeamMember(data: {
    name: string;
    email: string;
    password: string;
    nightclubId: string;
    role: 'STAFF' | 'MANAGER';
  }) {
    // 0. Trava de Segurança Máxima: Impede criação de admins via API pública
    if (data.role !== 'STAFF' && data.role !== 'MANAGER') {
      throw new BadRequestException(
        'Nível de acesso inválido ou não autorizado.',
      );
    }

    // 1. Verifica se o e-mail já está em uso para evitar duplicidade
    const userExists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new ConflictException('Este e-mail já está cadastrado no sistema.');
    }

    // 2. Criptografa a senha para o banco de dados
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(data.password, salt);

    // 3. Salva no banco amarrado à balada com o nível de acesso correto
    const newUser = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        nightclubId: data.nightclubId,
      },
    });

    // 4. Retorna os dados do usuário limpos (sem a senha)
    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      nightclubId: newUser.nightclubId,
    };
  }

  // 🛡️ NOVO: Buscar todos os membros da equipe de uma balada
  async getTeam(nightclubId: string) {
    return this.prisma.user.findMany({
      where: {
        nightclubId: nightclubId,
        role: {
          in: ['MANAGER', 'STAFF'], // Oculta o dono (OWNER) da lista
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  // 🛡️ NOVO: Deletar um membro da equipe (Demitir)
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
