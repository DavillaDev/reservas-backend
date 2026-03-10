import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly serviceIaUrl =
    process.env.SERVICE_IA_URL || 'http://localhost:3001';

  async requestWhatsappInstance(nightclubId: string) {
    try {
      // Faz a requisição para o nosso microserviço de IA que acabamos de construir
      const response = await axios.post(
        `${this.serviceIaUrl}/instances/create`,
        {
          nightclubId,
        },
      );

      return response.data;
    } catch (error) {
      console.error(
        '[AiService] Erro ao solicitar instância:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Não foi possível gerar o QR Code do WhatsApp.',
      );
    }
  }
}
