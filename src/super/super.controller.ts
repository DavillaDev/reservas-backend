import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Res,
  UseGuards, // 🔑 NOVO: Para usar o MasterAuthGuard
} from '@nestjs/common';
import { SuperService } from './super.service';
import type { Response } from 'express';
import { MasterAuthGuard } from './guards/master-auth.guard'; // 🔑 CORREÇÃO: Importa o Guard
import { MasterKeyDto } from './dto/master-key.dto'; // 🔑 CORREÇÃO: Importa o DTO

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {} // ** 🚨 A Lógica de validação foi movida para o service ou guard **
  // Deixamos esta função para o service ou a removemos, pois o Guard faz a checagem da sessão.

  // Vamos manter temporariamente para o POST /auth
  private validateMasterKey(key?: string) {
    if (!key || key !== process.env.MASTER_KEY) {
      throw new UnauthorizedException('Master key inválida.');
    }
  } // ====================================================================
  // 1. ROTA DE AUTENTICAÇÃO (Login) - Define o Cookie
  // ====================================================================

  @Post('auth')
  async authenticateMaster(
    @Body() { masterKey }: MasterKeyDto, // 🔑 CORREÇÃO: Usa o DTO
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateMasterKey(masterKey); // Sucesso na validação!

    const sessionToken = `master-${Date.now()}`; // Define o Cookie HTTP-ONLY

    res.cookie('master_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 24 horas de validade
      sameSite: 'strict',
    });

    return { success: true, message: 'Sessão Mestra estabelecida.' };
  }

  // ====================================================================
  // 1.5. NOVA ROTA DE LOGOUT - Remove o Cookie
  // ====================================================================
  @Post('logout')
  async logoutMaster(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('master_session');
    return { success: true, message: 'Sessão Mestra encerrada.' };
  } // ====================================================================
  // 2. ROTA DE DASHBOARD (Acesso Contínuo)
  // APLICAMOS O GUARD DE COOKIE AQUI.
  // ====================================================================

  @UseGuards(MasterAuthGuard) // 🔑 Aplica a checagem do Cookie!
  @Get('dashboard')
  async getDashboard() {
    // A execução só chega aqui se o MasterAuthGuard retornar TRUE (cookie validado)
    return this.superService.getDashboardData();
  }

  @Post('onboard')
  @UseGuards(MasterAuthGuard) // Protegemos a criação de clientes com o cookie
  async createClient(@Body() body: any) {
    // A validação da chave Master é feita pelo Guard
    // Se precisar da masterKey aqui para alguma lógica interna, você pode obtê-la.
    return this.superService.onboardClient(body);
  }
}
