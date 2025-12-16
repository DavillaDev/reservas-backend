import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class MasterAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // 🔒 Blindagem contra undefined em produção
    const cookies = request.cookies ?? {};
    const sessionCookie = cookies['master_session'];

    if (!sessionCookie || !sessionCookie.startsWith('master-')) {
      throw new UnauthorizedException('Sessão Mestra inválida ou expirada.');
    }

    return true;
  }
}
