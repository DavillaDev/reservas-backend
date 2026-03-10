import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('whatsapp/connect')
  async connectWhatsapp(@Body('nightclubId') nightclubId: string) {
    // Aqui chamamos o nosso service-ia através do AiService
    const result = await this.aiService.requestWhatsappInstance(nightclubId);

    return {
      message: 'QR Code gerado com sucesso!',
      data: result,
    };
  }
}
