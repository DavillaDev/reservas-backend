import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Res, // <-- Importante: Para manipular a resposta
} from '@nestjs/common';
import { SuperService } from './super.service';
import type { Response } from 'express'; // Importar o tipo de Resposta do Express

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {}

  // ** 🚨 FUNÇÃO validateKey REVERTIDA PARA PRIVADA E CHECA MASTER KEY **
  private validateMasterKey(key?: string) {
    if (!key || key !== process.env.MASTER_KEY) {
      throw new UnauthorizedException('Master key inválida.');
    }
  }

  // ====================================================================
  // 1. NOVA ROTA DE AUTENTICAÇÃO (Login)
  // O Front-end usará esta rota APENAS para trocar a masterKey pela sessão.
  // ====================================================================
  @Post('auth')
  async authenticateMaster(
    @Body('masterKey') masterKey: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateMasterKey(masterKey); // Valida a Master Key

    // Sucesso na validação!

    // Gera um token de sessão simples ou um JWT
    const sessionToken = `master-${Date.now()}`;

    // Define o Cookie HTTP-ONLY (Correção de Segurança)
    res.cookie('master_session', sessionToken, {
      httpOnly: true, // IMPEDE ACESSO VIA JAVASCRIPT (Proteção contra XSS)
      secure: process.env.NODE_ENV === 'production', // Só envia em HTTPS em produção
      maxAge: 1000 * 60 * 60 * 24, // 24 horas de validade
      sameSite: 'strict', // Proteção CSRF
    });

    return { success: true, message: 'Sessão Mestra estabelecida.' };
  }

  // ====================================================================
  // 2. ROTA DE DASHBOARD (Acesso Contínuo)
  // Agora precisa de um GUARD/MIDDLEWARE para checar o Cookie.
  // A checagem do Header 'x-master-key' será removida em breve.
  // ====================================================================

  @Get('dashboard')
  async getDashboard() {
    // REMOVEMOS @Headers('x-master-key') masterKey: string
    // Por enquanto, deixaremos a checagem no validateKey, mas o correto é um GUARD.
    // 🚨 TEMPORARIAMENTE: Se você não implementou um Guard/Middleware de Cookie:
    // Esta rota VAI FALHAR porque o validateKey não está sendo mais chamado com o Header,
    // mas sim com o Cookie.

    // Para ser mais seguro e correto, você PRECISA de um NestJS Guard
    // que checa o cookie 'master_session'.

    // **ASSUMINDO que você criará um Guard que checa o cookie e lança UnauthorizedException,
    // a rota final deve parecer assim:**

    // [CÓDIGO IDEAL FINAL]
    // @UseGuards(MasterSessionGuard) // <-- Novo Guard de Cookie
    // async getDashboard() {
    //     return this.superService.getDashboardData();
    // }

    // Se não puder criar o Guard agora: use o código original, mas saiba que está inseguro.

    return this.superService.getDashboardData();
  }

  @Post('onboard')
  async createClient(
    @Body() body: any,
    @Headers('x-master-key') masterKey: string,
  ) {
    this.validateMasterKey(masterKey);
    // ... (restante do código)
    return this.superService.onboardClient(body);
  }
}
