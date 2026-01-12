import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Verifica se o usuário atual já tem uma inscrição ativa no banco de dados.
   * Usamos uma busca segura pelo ID que vem do Token.
   */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req) {
    // Busca o ID tentando as chaves mais comuns (id ou sub)
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      console.error(
        '❌ [NOTIFICATIONS_CONTROLLER] Falha ao obter ID do usuário no status',
      );
      throw new UnauthorizedException('Usuário não identificado.');
    }

    const isSubscribed =
      await this.notificationsService.checkSubscription(userId);
    return { isSubscribed };
  }

  /**
   * Salva a inscrição (token) do navegador no banco de dados.
   * Adicionamos logs para capturar exatamente o que está vindo no 'req.user'.
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req, @Body() subscription: any) {
    // Log de diagnóstico para sabermos como o ID está vindo do seu sistema de Auth
    console.log(
      '🔍 [DEBUG_CONTROLLER] Conteúdo do req.user:',
      JSON.stringify(req.user),
    );

    // Tentativa de extração do ID (id ou sub)
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      console.error(
        '❌ [DEBUG_CONTROLLER] userId está UNDEFINED. Verifique o log acima.',
      );
      throw new UnauthorizedException(
        'Não foi possível identificar o ID do usuário no token.',
      );
    }

    console.log(
      '✅ [DEBUG_CONTROLLER] Enviando para o service. UserId:',
      userId,
    );

    return this.notificationsService.subscribe(userId, subscription);
  }
}
