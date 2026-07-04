import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 🛡️ Sobrescreve o limite global: Máximo de 5 tentativas a cada 60 segundos
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, string>) {
    // 🛡️ CORRIGIDO: De 'any' para 'string'
    return this.authService.login(signInDto.email, signInDto.password);
  }

  // 🛡️ Rota para o Admin criar usuários da equipe (STAFF, MANAGER ou PROMOTER)
  @Post('register-team')
  registerTeamMember(
    @Body()
    teamData: {
      name: string;
      email: string;
      password: string;
      nightclubId: string;
      role: 'STAFF' | 'MANAGER' | 'PROMOTER';
      commissionType?: 'FIXED' | 'PERCENTAGE'; // 👈 NOVO: Recebe o tipo de comissão
      commissionValue?: number; // 👈 NOVO: Recebe o valor da comissão
    },
  ) {
    // 🌟 CORRIGIDO: Agora repassa as variáveis financeiras para o AuthService
    return this.authService.registerTeamMember({
      name: teamData.name,
      email: teamData.email,
      password: teamData.password,
      nightclubId: teamData.nightclubId,
      role: teamData.role,
      commissionType: teamData.commissionType,
      commissionValue: teamData.commissionValue,
    });
  }

  // 🟢 NOVO: Rota para buscar a equipe da balada (Já com métricas financeiras)
  @Get('team/:nightclubId')
  getTeam(@Param('nightclubId') nightclubId: string) {
    return this.authService.getTeam(nightclubId);
  }

  // 💰 NOVO: Rota para o Dono dar baixa e liquidar as comissões pendentes via Pix
  @Post('payout/:promoterId')
  payPromoter(@Param('promoterId') promoterId: string) {
    return this.authService.payPromoterCommissions(promoterId);
  }

  // 🔴 NOVO: Rota para deletar/revogar acesso de um membro
  @Delete('team/:id')
  deleteTeamMember(@Param('id') id: string) {
    return this.authService.deleteTeamMember(id);
  }
}
