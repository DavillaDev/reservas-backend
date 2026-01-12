import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  // Configura as chaves VAPID com proteção para não quebrar o deploy
  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      console.warn(
        '⚠️ [PUSH] Notificações desativadas: Faltam chaves VAPID no ambiente.',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      console.log('✅ [PUSH] Configuração VAPID carregada com sucesso.');
    } catch (error) {
      console.error('❌ [PUSH] Erro ao configurar VAPID:', error.message);
    }
  }

  /**
   * Verifica se o usuário já possui alguma inscrição ativa no banco
   */
  async checkSubscription(userId: string): Promise<boolean> {
    const subscription = await this.prisma.pushSubscription.findFirst({
      where: { userId },
    });
    return !!subscription;
  }

  // A função que salva ou atualiza o token
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
