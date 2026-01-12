import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Verifica se o usuário atual já tem uma inscrição ativa
   * Isso resolve o problema de aparecer "Ativo" na Balada Y só porque ativou na X
   */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req) {
    const userId = req.user.id;
    // Chamamos o service para verificar no banco de dados
    const isSubscribed =
      await this.notificationsService.checkSubscription(userId);
    return { isSubscribed };
  }

  /**
   * Salva a inscrição (token) do navegador no banco de dados
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req, @Body() subscription: any) {
    const userId = req.user.id;
    return this.notificationsService.subscribe(userId, subscription);
  }
}
