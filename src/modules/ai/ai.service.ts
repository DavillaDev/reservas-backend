import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly serviceIaUrl =
    process.env.SERVICE_IA_URL || 'http://localhost:3001';

  constructor(private prisma: PrismaService) {}

  // ===========================================================================
  // 📲 CONEXÃO COM O WHATSAPP (Cria ou Reconecta via QR Code)
  // ===========================================================================
  async requestWhatsappInstance(nightclubId: string) {
    try {
      this.logger.log(
        `Tentando criar nova instância na Evolution para: ${nightclubId}`,
      );

      const response = await axios.post(
        `${this.serviceIaUrl}/instances/create`,
        { nightclubId },
      );

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const errorString = JSON.stringify(errorData).toLowerCase();

      // 🛡️ BLINDAGEM: Se o erro indicar que a instância já existe (409 ou mensagem específica)
      if (
        error.response?.status === 409 ||
        errorString.includes('already exists') ||
        errorString.includes('já existe')
      ) {
        this.logger.warn(
          `⚠️ Instância ${nightclubId} já existe na Evolution. Solicitando novo QR Code...`,
        );

        try {
          // 🔄 ROTA DE FUGA: Em vez de criar, apenas pede para conectar
          const fallbackResponse = await axios.get(
            `${this.serviceIaUrl}/instances/connect/${nightclubId}`,
          );

          return fallbackResponse.data;
        } catch (fallbackError: any) {
          this.logger.error(
            '❌ Erro no Fallback de reconexão:',
            fallbackError.response?.data || fallbackError.message,
          );
          throw new InternalServerErrorException(
            'Falha ao resgatar o QR Code da instância existente.',
          );
        }
      }

      // Se for um erro real (Evolution caiu, sem internet, etc)
      this.logger.error(
        '❌ Erro ao solicitar criação de instância:',
        errorData || error.message,
      );
      throw new InternalServerErrorException(
        'Não foi possível comunicar com o servidor de IA/WhatsApp.',
      );
    }
  }

  // ===========================================================================
  // 🔢 CONEXÃO COM O WHATSAPP (Via Código de Pareamento)
  // ===========================================================================
  async requestWhatsappCode(nightclubId: string, number: string) {
    try {
      this.logger.log(
        `🔢 Tentando solicitar Código de Pareamento para a balada: ${nightclubId}, número: ${number}`,
      );

      const response = await axios.post(
        `${this.serviceIaUrl}/instances/connect-code`,
        { nightclubId, number },
      );

      return response.data; // Vai retornar o { success: true, code: "XXXX-XXXX" }
    } catch (error: any) {
      const errorData = error.response?.data || {};
      this.logger.error(
        '❌ Erro ao solicitar Código de Pareamento:',
        errorData || error.message,
      );
      throw new InternalServerErrorException(
        errorData.error ||
          'Não foi possível gerar o código de pareamento. Verifique se o formato do número está correto.',
      );
    }
  }

  // ===========================================================================
  // 🤖 CONFIGURAÇÕES DA IA
  // ===========================================================================
  async updateSettings(
    nightclubId: string,
    isActive: boolean,
    systemPrompt: string,
  ) {
    try {
      const nightclub = await this.prisma.nightclub.findUnique({
        where: { id: nightclubId },
      });

      if (!nightclub) throw new NotFoundException('Balada não encontrada.');

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
      this.logger.error('❌ Erro ao salvar configurações:', error.message);
      throw new InternalServerErrorException(
        'Erro ao salvar as configurações da IA.',
      );
    }
  }
}
