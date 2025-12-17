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
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';

// 🛡️ URL do seu Admin na Vercel
const FRONTEND_URL = 'https://reservas-two-alpha.vercel.app';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // --- ROTAS PROTEGIDAS (MASTER ADMIN) ---

  @UseGuards(MasterAuthGuard)
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  }

  @UseGuards(MasterAuthGuard)
  @Get()
  findAll() {
    return this.nightclubsService.findAll();
  }

  @UseGuards(MasterAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nightclubsService.remove(id);
  }

  // --- ROTAS PÚBLICAS OU ADMIN LOCAL ---

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    return this.nightclubsService.update(id, updateNightclubDto);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  }

  // =========================================================
  // 🔑 INICIAR CONEXÃO OAUTH MERCADO PAGO
  // =========================================================
  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      console.log(`🚀 [START CONNECT] Solicitado para: ${nightclubId}`);
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);

      console.log(`🔗 [REDIRECT] Enviando usuário para: ${redirectUrl}`);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ [ERROR START] Falha ao gerar link MP:', error.message);
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_url_failed`,
      );
    }
  }

  // =========================================================
  // 🔑 CALLBACK (Onde o Mercado Pago retorna o CODE e STATE)
  // =========================================================
  @Get('mp-callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    // Log para confirmar que o Render recebeu a requisição do Mercado Pago
    console.log('🔔 [CALLBACK RECEBIDO] Dados brutos:', {
      code: code ? 'OK (TG-...)' : 'AUSENTE',
      nightclubId: nightclubId || 'AUSENTE',
    });

    // 1. Validação de segurança básica
    if (!code || !nightclubId) {
      console.error('❌ [CALLBACK ERROR] Parâmetros obrigatórios ausentes.');
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_auth_failed`,
      );
    }

    try {
      console.log('🔄 [OAUTH] Iniciando troca de tokens no Service...');

      // O Service processa a troca do code por access_token e salva no banco
      await this.nightclubsService.handleMpCallback(code, nightclubId);

      console.log('✅ [SUCCESS] Conta conectada e salva com sucesso!');

      // Redireciona de volta para o Admin com parâmetro de sucesso
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=success&message=mp_connected`,
      );
    } catch (error) {
      // Log detalhado no Render para sabermos por que o Service falhou
      console.error(
        '❌ [FATAL ERROR] Falha no processamento do callback:',
        error.message,
      );

      if (error.response?.data) {
        console.error(
          '📦 [MP API ERROR]:',
          JSON.stringify(error.response.data),
        );
      }

      // Redireciona com erro específico de troca de token
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_token_exchange_failed`,
      );
    }
  }
}
