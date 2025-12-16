// src/super/guards/master-auth.guard.ts (COMPLETO E FINALIZADO)

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
    // 1. Extrai o objeto Request
    const request = context.switchToHttp().getRequest<Request>(); // 2. Tenta ler o cookie

    const sessionCookie = request.cookies?.['master_session']; // 3. Log para diagnóstico (pode ser removido após o sucesso)
    // 4. Validação da Sessão Mestra

    // console.log("MasterAuthGuard: Cookie lido:", sessionCookie);

    if (
      !sessionCookie ||
      typeof sessionCookie !== 'string' ||
      !sessionCookie.startsWith('master-')
    ) {
      // Lança 401 Unauthorized, que é o status que o Front-end precisa
      // para exibir o formulário de login.
      throw new UnauthorizedException('Sessão Mestra inválida ou expirada.');
    } // Se chegou aqui, o cookie é válido e a requisição é permitida.

    return true;
  }
}
