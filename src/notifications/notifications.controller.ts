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
   * Ajustado para ler 'userId' conforme revelado pelos logs do Render.
   */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req) {
    // O LOG REVELOU: O ID está em req.user.userId
    const userId = req.user?.userId;

    if (!userId) {
      console.error(
        '❌ [NOTIFICATIONS_CONTROLLER] Falha ao obter userId do objeto:',
        JSON.stringify(req.user),
      );
      throw new UnauthorizedException('Usuário não identificado no sistema.');
    }

    const isSubscribed =
      await this.notificationsService.checkSubscription(userId);
    return { isSubscribed };
  }

  /**
   * Salva a inscrição (token) do navegador no banco de dados.
   * Ajustado para ler 'userId' conforme revelado pelos logs do Render.
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req, @Body() subscription: any) {
    // O LOG REVELOU: O ID está em req.user.userId
    const userId = req.user?.userId;

    if (!userId) {
      console.error(
        '❌ [NOTIFICATIONS_CONTROLLER] userId não encontrado no POST. Conteúdo:',
        JSON.stringify(req.user),
      );
      throw new UnauthorizedException('Erro de identificação do usuário.');
    }

    console.log(
      '✅ [NOTIFICATIONS_CONTROLLER] ID identificado com sucesso:',
      userId,
    );

    return this.notificationsService.subscribe(userId, subscription);
  }
}
