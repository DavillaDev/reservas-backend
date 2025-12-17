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

// 🛡️ ATUALIZADO: Usando seu novo domínio para redirecionamentos
const FRONTEND_URL = 'https://reservasclub.com.br';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // =========================================================
  // 🔑 CALLBACK OAUTH (POSIÇÃO PRIORITÁRIA NO TOPO)
  // =========================================================
  @Get('oauth/callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    console.log('🔔 [CALLBACK RECEBIDO] Dados:', {
      code: code ? 'OK (TG-...)' : 'AUSENTE',
      nightclubId,
    });

    if (!code || !nightclubId) {
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_auth_failed`,
      );
    }

    try {
      console.log('🔄 [OAUTH] Iniciando troca de tokens no Service...');
      await this.nightclubsService.handleMpCallback(code, nightclubId);
      console.log('✅ [SUCCESS] Conta conectada e salva com sucesso!');

      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=success&message=mp_connected`,
      );
    } catch (error) {
      console.error('❌ [FATAL ERROR] Falha no callback:', error.message);
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_token_exchange_failed`,
      );
    }
  }

  // =========================================================
  // 🔑 INICIAR CONEXÃO
  // =========================================================
  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      console.log(`🚀 [START CONNECT] Solicitado para: ${nightclubId}`);
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ [ERROR START] Falha ao gerar link MP:', error.message);
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_url_failed`,
      );
    }
  }

  // --- RESTO DAS ROTAS (CRUD) ---

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

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  // 🚨 MANTENHA ESTA ABAIXO DO CALLBACK PARA NÃO CONFLITAR
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    return this.nightclubsService.update(id, updateNightclubDto);
  }

  @UseGuards(MasterAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nightclubsService.remove(id);
  }
}
