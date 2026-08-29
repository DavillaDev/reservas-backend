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

      // 🛡️ BLINDAGEM:
      // Se o erro indicar que a instância já existe
      if (
        error.response?.status === 409 ||
        errorString.includes('already exists') ||
        errorString.includes('já existe')
      ) {
        this.logger.warn(
          `⚠️ Instância ${nightclubId} já existe na Evolution. Solicitando novo QR Code...`,
        );

        try {
          // 🔄 ROTA DE FUGA:
          // Em vez de criar, apenas pede para conectar
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

      const url = `${this.serviceIaUrl}/instances/connect-code`;

      this.logger.log(`➡️ SERVICE IA URL: ${this.serviceIaUrl}`);
      this.logger.log(`➡️ URL chamada: ${url}`);

      const response = await axios.post(url, {
        nightclubId,
        number,
      });

      this.logger.log(
        `✅ Código de pareamento solicitado com sucesso para: ${nightclubId}`,
      );

      return response.data;
    } catch (error: any) {
      /*
       * DEBUG TEMPORÁRIO
       *
       * Aqui queremos descobrir quem está devolvendo o
       * "Too Many Requests".
       */

      console.log('');
      console.log('==============================================');
      console.log('🚨 DEBUG - ERRO CONNECT CODE');
      console.log('==============================================');

      console.log('SERVICE IA URL:');
      console.log(this.serviceIaUrl);

      console.log('');
      console.log('URL CHAMADA:');
      console.log(`${this.serviceIaUrl}/instances/connect-code`);

      console.log('');
      console.log('NIGHTCLUB ID:');
      console.log(nightclubId);

      console.log('');
      console.log('NÚMERO ENVIADO:');
      console.log(number);

      console.log('');
      console.log('STATUS HTTP:');
      console.log(error.response?.status);

      console.log('');
      console.log('STATUS TEXT:');
      console.log(error.response?.statusText);

      console.log('');
      console.log('DATA DA RESPOSTA:');
      console.dir(error.response?.data, {
        depth: null,
      });

      console.log('');
      console.log('HEADERS DA RESPOSTA:');
      console.dir(error.response?.headers, {
        depth: null,
      });

      console.log('');
      console.log('HEADERS DA REQUISIÇÃO:');
      console.dir(error.config?.headers, {
        depth: null,
      });

      console.log('');
      console.log('MÉTODO:');
      console.log(error.config?.method);

      console.log('');
      console.log('URL REAL DO AXIOS:');
      console.log(error.config?.url);

      console.log('');
      console.log('MENSAGEM DO AXIOS:');
      console.log(error.message);

      console.log('');
      console.log('CÓDIGO DO AXIOS:');
      console.log(error.code);

      console.log('==============================================');
      console.log('');

      const errorData = error.response?.data || {};

      this.logger.error(
        '❌ Erro ao solicitar Código de Pareamento:',
        errorData || error.message,
      );

      throw new InternalServerErrorException(
        errorData?.error ||
          errorData?.message ||
          'Não foi possível gerar o código de pareamento. Verifique se o formato do número está correto.',
      );
    }
  }

  // ===========================================================================
  // 🤖 CONFIGURAÇÕES DA IA (MODULARIZADO)
  // ===========================================================================
  async updateSettings(
    nightclubId: string,
    isActive: boolean,
    systemPrompt: string,
    promptIdentity?: string,
    promptTable?: string,
    promptBirthday?: string,
    promptEvents?: string,
    promptSchedule?: any,
    birthdayPrice?: string | number,
    mediaLinks?: any,
  ) {
    try {
      const nightclub = await this.prisma.nightclub.findUnique({
        where: {
          id: nightclubId,
        },
      });

      if (!nightclub) {
        throw new NotFoundException('Balada não encontrada.');
      }

      // 🛠️ Tratamento do preço
      // Converte "50,00" para número que o Prisma aceita
      let formattedPrice: number | undefined = undefined;

      if (
        birthdayPrice !== undefined &&
        birthdayPrice !== null &&
        birthdayPrice !== ''
      ) {
        if (typeof birthdayPrice === 'string') {
          const cleanString = birthdayPrice
            .replace('R$', '')
            .replace(/\s/g, '')
            .replace(',', '.');

          formattedPrice = parseFloat(cleanString);
        } else {
          formattedPrice = Number(birthdayPrice);
        }
      }

      const agent = await this.prisma.aiAgent.upsert({
        where: {
          nightclubId,
        },

        update: {
          isActive,
          systemPrompt,
          promptIdentity,
          promptTable,
          promptBirthday,
          promptEvents,

          promptSchedule: promptSchedule ? promptSchedule : undefined,

          birthdayPrice: formattedPrice,

          mediaLinks: mediaLinks ? mediaLinks : undefined,
        },

        create: {
          nightclubId,
          isActive,
          systemPrompt,
          promptIdentity,
          promptTable,
          promptBirthday,
          promptEvents,

          promptSchedule: promptSchedule ? promptSchedule : undefined,

          birthdayPrice: formattedPrice,

          mediaLinks: mediaLinks ? mediaLinks : undefined,
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
