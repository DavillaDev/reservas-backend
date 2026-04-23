import {
  Controller,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; // Blindagem de segurança

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ===========================================================================
  // 1. GERAR QR CODE / CONECTAR WHATSAPP
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Post('whatsapp/connect')
  async connectWhatsapp(
    @Body('nightclubId') nightclubId: string,
    @Request() req: any,
  ) {
    // Trava de segurança: O dono só mexe na própria balada (ou se for MASTER)
    if (req.user.nightclubId !== nightclubId && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Acesso negado.');
    }

    const result = await this.aiService.requestWhatsappInstance(nightclubId);

    return {
      message: 'QR Code gerado com sucesso!',
      data: result,
    };
  }

  // ===========================================================================
  // 1.5 GERAR CÓDIGO DE PAREAMENTO (NOVO MÉTODO) 🔢
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Post('whatsapp/connect-code')
  async connectWhatsappWithCode(
    @Body('nightclubId') nightclubId: string,
    @Body('number') number: string,
    @Request() req: any,
  ) {
    // Trava de segurança: O dono só mexe na própria balada (ou se for MASTER)
    if (req.user.nightclubId !== nightclubId && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Acesso negado.');
    }

    const result = await this.aiService.requestWhatsappCode(
      nightclubId,
      number,
    );

    return {
      message: 'Código de pareamento gerado com sucesso!',
      data: result,
    };
  }

  // ===========================================================================
  // 2. SALVAR CONFIGURAÇÕES E INSTRUÇÕES DA IA 🚀 (MODULARIZADO)
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Patch('settings')
  async updateSettings(
    @Body('nightclubId') nightclubId: string,
    @Body('isActive') isActive: boolean,
    @Body('systemPrompt') systemPrompt: string, // Mantemos por retrocompatibilidade

    // 🛡️ NOSSOS NOVOS CAMPOS FATIADOS
    @Body('promptIdentity') promptIdentity: string,
    @Body('promptTable') promptTable: string,
    @Body('promptBirthday') promptBirthday: string,
    @Body('promptEvents') promptEvents: string,
    @Body('promptSchedule') promptSchedule: any,

    @Request() req: any,
  ) {
    // Trava de segurança
    if (req.user.nightclubId !== nightclubId && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Acesso negado.');
    }

    // Repassamos todos os campos novos pro service
    const result = await this.aiService.updateSettings(
      nightclubId,
      isActive,
      systemPrompt,
      promptIdentity,
      promptTable,
      promptBirthday,
      promptEvents,
      promptSchedule,
    );

    return {
      message: 'Configurações da IA atualizadas com sucesso!',
      data: result,
    };
  }
}
