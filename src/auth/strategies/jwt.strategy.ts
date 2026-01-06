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
      secretOrKey: process.env.JWT_SECRET || 'SUA_CHAVE_SUPER_SECRETA_AQUI',
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
