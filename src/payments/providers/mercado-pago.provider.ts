import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

@Injectable()
export class MercadoPagoProvider {
  private readonly logger = new Logger(MercadoPagoProvider.name);

  // 🛡️ MOTOR DE RESILIÊNCIA ISOLADO E BLINDADO
  public async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let attempt = 1;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        // Pega a mensagem de erro em texto, porque o SDK às vezes esconde o status numérico
        const errorMsg = (
          error.response?.data?.message ||
          error.message ||
          ''
        ).toLowerCase();
        const statusCode =
          error.status || error.response?.status || error.api_response?.status;

        // 🛑 A MÁGICA ATUALIZADA: Se for 4xx OU tiver a palavra mágica de token inválido, aborta na hora!
        if (
          (statusCode >= 400 && statusCode < 500 && statusCode !== 429) ||
          errorMsg.includes('invalid access token') ||
          errorMsg.includes('unauthorized')
        ) {
          throw error;
        }

        if (attempt === maxRetries) {
          this.logger.error(
            `❌ Todas as ${maxRetries} tentativas falharam no Mercado Pago.`,
          );
          throw error;
        }

        const delay = attempt * 1000;
        this.logger.warn(
          `⚠️ Falha na API do MP. Tentativa ${attempt}/${maxRetries}. Retentando em ${delay}ms...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        attempt++;
      }
    }
    throw new Error('Falha inesperada no motor de retry.');
  }

  // 🔌 CLIENTE BASE
  private getClient(accessToken: string) {
    if (!accessToken) {
      throw new InternalServerErrorException(
        'Token do Mercado Pago não fornecido ao Provider.',
      );
    }
    return new MercadoPagoConfig({ accessToken });
  }

  // 💰 GERAR PIX
  async createPixPayment(accessToken: string, paymentBody: any) {
    const client = this.getClient(accessToken);
    const payment = new Payment(client);

    try {
      return await this.withRetry(() => payment.create({ body: paymentBody }));
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || '';

      // Se der erro de application_fee, o provider já tenta de novo sem a taxa automaticamente
      if (errorMsg.includes('application_fee')) {
        this.logger.warn(
          `[PROVIDER] Tentando gerar Pix sem application_fee...`,
        );
        delete paymentBody.application_fee;
        return await this.withRetry(() =>
          payment.create({ body: paymentBody }),
        );
      }
      throw error;
    }
  }

  // 🔍 BUSCAR PAGAMENTO EXISTENTE
  async getPaymentStatus(accessToken: string, paymentId: string | number) {
    const client = this.getClient(accessToken);
    const payment = new Payment(client);
    return this.withRetry(() => payment.get({ id: paymentId }));
  }

  // 🌟 ASSINATURAS / PLANO PREMIUM
  async createPreference(accessToken: string, preferenceBody: any) {
    const client = this.getClient(accessToken);
    const preference = new Preference(client);
    return this.withRetry(() => preference.create({ body: preferenceBody }));
  }
}
