import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Ajuste conforme seu sistema de auth

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req, @Body() subscription: any) {
    // Pegamos o ID do usuário que vem do Token JWT (Dono/Gerente)
    const userId = req.user.id;
    return this.notificationsService.subscribe(userId, subscription);
  }
}
