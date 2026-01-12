import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  // Configura as chaves VAPID assim que o módulo inicia
  onModuleInit() {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  // A função que salva o token (você já tem, mantivemos aqui)
  async subscribe(userId: string, subscription: any) {
    const { endpoint, keys } = subscription;
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, auth: keys.auth, p256dh: keys.p256dh },
      create: {
        userId,
        endpoint,
        auth: keys.auth,
        p256dh: keys.p256dh,
        deviceName: 'Navegador Web',
      },
    });
  }

  /**
   * O DISPARO REAL: Envia a notificação para todos os donos/gerentes da balada
   */
  async notifyNewReservation(nightclubId: string, reservationDetails: any) {
    // 1. Busca todos os usuários vinculados àquela balada
    const users = await this.prisma.user.findMany({
      where: { nightclubId },
      include: { pushSubscriptions: true },
    });

    // 2. Prepara a mensagem
    const payload = JSON.stringify({
      title: '💰 NOVA RESERVA CONFIRMADA!',
      body: `${reservationDetails.customerName} reservou ${reservationDetails.spaceName}.`,
      url: `/dashboard/reservations/${reservationDetails.id}`,
    });

    // 3. Varre todos os usuários e seus dispositivos enviando o push
    const notifications = users.flatMap((user) =>
      user.pushSubscriptions.map((sub) => {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh,
          },
        };

        return webpush.sendNotification(pushConfig, payload).catch((err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Token expirado ou inválido, deletamos do banco para manter limpo
            return this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          }
          console.error('Erro ao enviar push:', err);
        });
      }),
    );

    await Promise.all(notifications);
  }
}
