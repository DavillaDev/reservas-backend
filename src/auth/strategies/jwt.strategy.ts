// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 🚨 Mário: A chave abaixo DEVE ser idêntica à do AuthModule!
      secretOrKey: process.env.JWT_SECRET || 'SEGREDO_SUPER_SECRETO',
    });
  }

  async validate(payload: any) {
    // O que retornarmos aqui será o que aparecerá no req.user do Controller
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      nightclubId: payload.nightclubId,
    };
  }
}
