// api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport'; // 🛡️ Necessário para as estratégias
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy'; // 🛡️ Sua nova estratégia
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [
    // 1. Registra o Passport para gerenciar o fluxo de autenticação
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // 2. Configura o JWT
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'SEGREDO_SUPER_SECRETO',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  // 3. Adicionamos a JwtStrategy aqui para o NestJS poder usá-la
  providers: [AuthService, PrismaService, JwtStrategy],
  // 4. Exportamos o Passport e o JwtModule para que outros módulos (como o de Nightclubs) herdem essa proteção
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
