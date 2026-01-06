// src/auth/guards/jwt-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // Se houver erro ou o usuário não for encontrado no token
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Sessão inválida ou expirada. Faça login novamente.',
        )
      );
    }
    return user;
  }
}
