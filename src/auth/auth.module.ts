// api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt'; // 👈 Importe isso
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    // Configuração básica do JWT
    JwtModule.register({
      global: true,
      secret: 'SEGREDO_SUPER_SECRETO', // Em produção, use process.env.JWT_SECRET
      signOptions: { expiresIn: '1d' }, // Token dura 1 dia
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}
