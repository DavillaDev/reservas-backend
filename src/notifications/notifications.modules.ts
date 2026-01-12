import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service'; // Ajuste o caminho se o seu PrismaService estiver em outro lugar

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PrismaService],
  exports: [NotificationsService], // Exportamos caso outros módulos precisem disparar notificações futuramente
})
export class NotificationsModule {}
