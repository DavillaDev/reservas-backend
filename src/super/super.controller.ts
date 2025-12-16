// api/src/super/super.controller.ts (FINALIZADO E CORRIGIDO)

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Res,
  UseGuards, // 🔑 Para usar o MasterAuthGuard
} from '@nestjs/common';
import { SuperService } from './super.service';
import type { Response } from 'express';
import { MasterAuthGuard } from './guards/master-auth.guard'; // 🔑 Importa o Guard
import { MasterKeyDto } from './dto/master-key.dto'; // 🔑 DTO de Master Key (Assumindo que você o criou)

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {} // ** Lógica para checar a Master Key (usada apenas no login) **

  private validateMasterKey(key?: string) {
    if (!key || key !== process.env.MASTER_KEY) {
      throw new UnauthorizedException('Master key inválida.');
    }
  } // ====================================================================
  // 1. ROTA DE AUTENTICAÇÃO (Login) - Define o Cookie e corrige o CORS
  // ====================================================================

  @Post('auth')
  async authenticateMaster(
    @Body() { masterKey }: MasterKeyDto, // Usa o DTO
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateMasterKey(masterKey); // Sucesso na validação!

    const sessionToken = `master-${Date.now()}`; // Define o Cookie HTTP-ONLY

    res.cookie('master_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 24 horas
      sameSite: 'strict',
    });

    // 🔑 CORREÇÃO CRÍTICA DO CORS: Força o cabeçalho de credenciais
    // Isso resolveu o erro 'Network Error/0 B' na resposta do cookie.
    res.header('Access-Control-Allow-Credentials', 'true');

    return { success: true, message: 'Sessão Mestra estabelecida.' };
  }

  // ====================================================================
  // 1.5. ROTA DE LOGOUT - Remove o Cookie
  // ====================================================================
  @Post('logout')
  async logoutMaster(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('master_session');
    return { success: true, message: 'Sessão Mestra encerrada.' };
  } // ====================================================================
  // 2. ROTA DE DASHBOARD (Acesso Contínuo)
  // Protegida pelo MasterAuthGuard.
  // ====================================================================

  @UseGuards(MasterAuthGuard) // 🔑 Aplica a checagem do Cookie!
  @Get('dashboard')
  async getDashboard() {
    // A execução só chega aqui se o MasterAuthGuard retornar TRUE
    return this.superService.getDashboardData();
  } // ====================================================================
  // 3. ROTA DE ONBOARDING (Criação de Clientes)
  // Protegida pelo MasterAuthGuard.
  // ====================================================================

  @Post('onboard')
  @UseGuards(MasterAuthGuard) // Protegemos a criação de clientes com o cookie
  async createClient(@Body() body: any) {
    return this.superService.onboardClient(body);
  }
}
