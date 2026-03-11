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
  // 2. SALVAR CONFIGURAÇÕES E INSTRUÇÕES DA IA 🚀 [NOVO]
  // ===========================================================================
  @UseGuards(JwtAuthGuard)
  @Patch('settings')
  async updateSettings(
    @Body('nightclubId') nightclubId: string,
    @Body('isActive') isActive: boolean,
    @Body('systemPrompt') systemPrompt: string,
    @Request() req: any,
  ) {
    // Trava de segurança
    if (req.user.nightclubId !== nightclubId && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Acesso negado.');
    }

    const result = await this.aiService.updateSettings(
      nightclubId,
      isActive,
      systemPrompt,
    );

    return {
      message: 'Configurações da IA atualizadas com sucesso!',
      data: result,
    };
  }
}
