/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

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

      // 🛡️ BLINDAGEM: Se o erro indicar que a instância já existe
      if (
        error.response?.status === 409 ||
        errorString.includes('already exists') ||
        errorString.includes('já existe')
      ) {
        this.logger.warn(
          `⚠️ Instância ${nightclubId} já existe na Evolution. Solicitando novo QR Code...`,
        );

        try {
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
      const targetUrl = `${this.serviceIaUrl}/instances/connect-code`;

      this.logger.log(
        `🔢 Tentando solicitar Código de Pareamento para a balada: ${nightclubId}, número: ${number}`,
      );

      // 🕵️ O DEDO-DURO
      this.logger.log(`🎯 [DEDO-DURO] Atirando para a URL -> ${targetUrl}`);

      const response = await axios.post(targetUrl, { nightclubId, number });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data || {};

      // 🕵️ O DEDO-DURO
      this.logger.error(
        `❌ [DEDO-DURO] Falha no tiro! Status HTTP: ${error.response?.status}`,
      );
      this.logger.error(
        `❌ [DEDO-DURO] Resposta do bloqueio:`,
        JSON.stringify(errorData),
      );

      throw new InternalServerErrorException(
        errorData.error ||
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
        where: { id: nightclubId },
      });

      if (!nightclub) throw new NotFoundException('Balada não encontrada.');

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
        where: { nightclubId },
        update: {
          isActive,
          systemPrompt,
          promptIdentity,
          promptTable,
          promptBirthday,
          promptEvents,
          promptSchedule: promptSchedule || undefined,
          birthdayPrice: formattedPrice,
          mediaLinks: mediaLinks || undefined,
        },
        create: {
          nightclubId,
          isActive,
          systemPrompt,
          promptIdentity,
          promptTable,
          promptBirthday,
          promptEvents,
          promptSchedule: promptSchedule || undefined,
          birthdayPrice: formattedPrice,
          mediaLinks: mediaLinks || undefined,
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
