import { Injectable, UnauthorizedException } from '@nestjs/common';
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
}
