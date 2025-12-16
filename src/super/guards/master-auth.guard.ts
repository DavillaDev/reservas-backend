// src/super/guards/master-auth.guard.ts

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
    const sessionCookie = request.cookies['master_session'];

    if (!sessionCookie || !sessionCookie.startsWith('master-')) {
      // 401 Unauthorized é retornado se a sessão não for válida.
      throw new UnauthorizedException('Sessão Mestra inválida ou expirada.');
    }

    // Se o cookie existir e tiver o formato básico, o acesso é concedido.
    // Em produção, aqui você faria uma checagem mais profunda (ex: JWT Decode ou Cache Lookup).
    return true;
  }
}
