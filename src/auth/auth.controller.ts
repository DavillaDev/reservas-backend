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
    },
  ) {
    // 🌟 CORRIGIDO: Agora o Controller sabe exatamente quais strings são permitidas e o TypeScript para de chorar!
    return this.authService.registerTeamMember({
      name: teamData.name,
      email: teamData.email,
      password: teamData.password,
      nightclubId: teamData.nightclubId,
      role: teamData.role,
    });
  }

  // 🟢 NOVO: Rota para buscar a equipe da balada
  @Get('team/:nightclubId')
  getTeam(@Param('nightclubId') nightclubId: string) {
    return this.authService.getTeam(nightclubId);
  }

  // 🔴 NOVO: Rota para deletar/revogar acesso de um membro
  @Delete('team/:id')
  deleteTeamMember(@Param('id') id: string) {
    return this.authService.deleteTeamMember(id);
  }
}
