import {
  Injectable,
  UnauthorizedException,
  ConflictException,
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

  // 🛡️ NOVO MÉTODO: Criação de Usuário STAFF
  async registerStaff(data: {
    name: string;
    email: string;
    password: string;
    nightclubId: string;
  }) {
    // 1. Verifica se o e-mail já está em uso para evitar duplicidade
    const userExists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new ConflictException('Este e-mail já está cadastrado no sistema.');
    }

    // 2. Criptografa a senha da recepcionista para o banco de dados
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(data.password, salt);

    // 3. Salva no banco amarrado à balada do Admin e forçando a role STAFF
    const newUser = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: 'STAFF', // 🔒 Garantia de segurança: hardcoded como STAFF
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
}
