import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Res,
  Query,
  UnauthorizedException,
  Request,
  Headers,
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const FRONTEND_URL = 'https://reservasclub.com.br';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // ===========================================================================
  // 1. ROTA VIP: ATUALIZAR STATUS DA INSTÂNCIA (CHAMADA PELA IA) 🚀 [NOVO]
  // ===========================================================================
  @Patch('instance/status')
  async updateInstanceStatus(
    @Body() data: { instanceName: string; status: string },
    @Headers('x-internal-key') internalKey: string,
  ) {
    const masterKey = process.env.INTERNAL_SERVICE_KEY;

    if (!internalKey || internalKey !== masterKey) {
      console.error(`[Status Update] Tentativa de acesso não autorizado.`);
      throw new UnauthorizedException('Chave de serviço inválida.');
    }

    return this.nightclubsService.updateInstanceStatus(
      data.instanceName,
      data.status,
    );
  }

  // ===========================================================================
  // 1.5. 🛰️ WEBHOOK DIRETO DA EVOLUTION (STATUS DE CONEXÃO E QR CODE)
  // ===========================================================================
  @Post('webhook/whatsapp')
  async handleWhatsappWebhook(@Body() body: any) {
    const event = body.event;
    const instanceName = body.instance;

    if (event === 'connection.update') {
      const status = body.data?.state || body.data?.status;
      if (status) {
        console.log(
          `[Evolution Webhook] Instância ${instanceName} mudou para: ${status}`,
        );
        await this.nightclubsService.updateInstanceStatus(instanceName, status);
      }
    }

    if (event === 'qrcode.updated') {
      console.log(
        `[Evolution Webhook] Novo QR Code gerado para: ${instanceName}`,
      );
    }
    return { received: true };
  }

  // ===========================================================================
  // 2. ROTA PARA O MICROSERVIÇO DE IA (PROTEGIDA POR INTERNAL KEY)
  // ===========================================================================
  @Get('service-ia/:id')
  async findOneForIA(
    @Param('id') id: string,
    @Headers('x-internal-key') internalKey: string,
  ) {
    const masterKey = process.env.INTERNAL_SERVICE_KEY;

    if (!internalKey || internalKey !== masterKey) {
      console.error(
        `[IA Access] Tentativa de acesso não autorizado ao ID: ${id}`,
      );
      throw new UnauthorizedException('Chave de serviço inválida.');
    }

    return this.nightclubsService.findOne(id);
  }

  // ===========================================================================
  // 3. MERCADO PAGO OAUTH INÍCIO E CALLBACK
  // ===========================================================================

  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    console.log(
      `\n🔗 [OAUTH - PASSO 1] Botão de conectar clicado no Frontend.`,
    );
    console.log(`🔗 [OAUTH - PASSO 1] ID da Balada recebido: ${nightclubId}`);

    try {
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      console.log(
        `🔗 [OAUTH - PASSO 1] URL de autorização do Mercado Pago montada com sucesso:`,
      );
      console.log(
        `🔗 [OAUTH - PASSO 1] Redirecionando usuário para -> ${redirectUrl}\n`,
      );
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error(
        '❌ [OAUTH - ERRO PASSO 1] Erro ao gerar URL:',
        error.message,
      );
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_url_failed`,
      );
    }
  }

  @Get('oauth/callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    console.log(
      `\n📥 [OAUTH - PASSO 2] O Mercado Pago devolveu o usuário para o nosso Callback!`,
    );
    console.log(`📥 [OAUTH - PASSO 2] Parâmetros extraídos da URL:`);
    console.log(
      `   - param "code" (Autorização): ${code ? code.substring(0, 10) + '...' : 'AUSENTE!'}`,
    );
    console.log(`   - param "state" (Nightclub ID): ${nightclubId}`);

    try {
      if (!code || !nightclubId)
        throw new Error(
          'Dados ausentes no callback (code ou state não vieram na URL)',
        );

      await this.nightclubsService.handleMpCallback(code, nightclubId);

      console.log(
        `✅ [OAUTH - PASSO 5] Fluxo concluído no backend! Redirecionando para o frontend com sucesso.\n`,
      );
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=success&mp=connected`,
      );
    } catch (error) {
      console.error(
        '❌ [OAUTH - ERRO FINAL] Erro no callback MP:',
        error.message,
      );
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=connection_failed`,
      );
    }
  }

  // --- RESTANTE DO CRUD (MANTENDO PROTEGIDO) ---

  @UseGuards(MasterAuthGuard)
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    if (req.user.nightclubId !== id && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Ação não permitida para sua conta.');
    }
    return this.nightclubsService.update(id, updateNightclubDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    if (req.user.nightclubId !== id && req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Acesso negado.');
    }
    return this.nightclubsService.findOne(id);
  }

  @UseGuards(MasterAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nightclubsService.remove(id);
  }
}
