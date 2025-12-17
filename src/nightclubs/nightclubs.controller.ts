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

// 🌐 URL do Frontend (Admin)
const FRONTEND_URL = 'https://reservas-two-alpha.vercel.app';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // =========================================================
  // 🛡️ ROTAS PROTEGIDAS (MASTER ADMIN)
  // =========================================================

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

  // =========================================================
  // 🔑 INTEGRAÇÃO MERCADO PAGO (OAUTH)
  // ⚠️ SEMPRE ANTES DAS ROTAS DINÂMICAS (:id)
  // =========================================================

  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      console.log(`🚀 [START CONNECT] Solicitado para: ${nightclubId}`);

      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);

      console.log(`🔗 [REDIRECT] Enviando usuário para: ${redirectUrl}`);

      return res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('❌ [ERROR START] Falha ao gerar link MP:', error.message);

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
    // 🔔 Confirma que o callback chegou no backend
    console.log('🔔 [CALLBACK RECEBIDO] Dados:', {
      code: code ? 'OK (TG-...)' : 'AUSENTE',
      nightclubId: nightclubId || 'AUSENTE',
    });

    // 🔐 Validação mínima de segurança
    if (!code || !nightclubId) {
      console.error('❌ [CALLBACK ERROR] Parâmetros obrigatórios ausentes.');

      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_auth_failed`,
      );
    }

    try {
      console.log('🔄 [OAUTH] Iniciando troca de tokens...');

      await this.nightclubsService.handleMpCallback(code, nightclubId);

      console.log('✅ [SUCCESS] Conta Mercado Pago conectada com sucesso!');

      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=success&message=mp_connected`,
      );
    } catch (error: any) {
      console.error('❌ [FATAL ERROR] Falha no callback OAuth:', error.message);

      if (error.response?.data) {
        console.error(
          '📦 [MP API ERROR]:',
          JSON.stringify(error.response.data),
        );
      }

      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_token_exchange_failed`,
      );
    }
  }

  // =========================================================
  // 🌐 ROTAS PÚBLICAS / ADMIN LOCAL
  // =========================================================

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    return this.nightclubsService.update(id, updateNightclubDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  }
}
