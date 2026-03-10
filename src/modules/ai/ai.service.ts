import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly serviceIaUrl =
    process.env.SERVICE_IA_URL || 'http://localhost:3001';

  constructor(private prisma: PrismaService) {}

  // 📲 Solicita QR Code ao microserviço
  async requestWhatsappInstance(nightclubId: string) {
    try {
      const response = await axios.post(
        `${this.serviceIaUrl}/instances/create`,
        {
          nightclubId,
        },
      );

      return response.data;
    } catch (error: any) {
      console.error(
        '[AiService] Erro ao solicitar instância:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Não foi possível gerar o QR Code do WhatsApp.',
      );
    }
  }

  // 🤖 Salva as configurações de treinamento e status do robô
  async updateSettings(
    nightclubId: string,
    isActive: boolean,
    systemPrompt: string,
  ) {
    try {
      // Verifica se a balada existe antes de criar o agente
      const nightclub = await this.prisma.nightclub.findUnique({
        where: { id: nightclubId },
      });

      if (!nightclub) throw new NotFoundException('Balada não encontrada.');

      // Upsert: Cria se não existir, atualiza se já existir
      const agent = await this.prisma.aiAgent.upsert({
        where: { nightclubId },
        update: {
          isActive,
          systemPrompt,
        },
        create: {
          nightclubId,
          isActive,
          systemPrompt,
        },
      });

      return agent;
    } catch (error: any) {
      console.error('[AiService] Erro ao salvar configurações:', error.message);
      throw new InternalServerErrorException(
        'Erro ao salvar as configurações da IA.',
      );
    }
  }
}
