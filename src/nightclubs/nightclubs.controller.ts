// api/src/nightclubs/nightclubs.controller.ts

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

// URL do seu Frontend na Vercel para redirecionamentos
const FRONTEND_URL = 'https://reservas-two-alpha.vercel.app';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // --- ROTAS PROTEGIDAS APENAS PELO MASTER ADMIN (Plataforma) ---

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

  // --- ROTAS ACESSÍVEIS PELO ADMIN LOCAL (DONO DA BALADA) ---

  // 🛡️ CORREÇÃO: Removido MasterAuthGuard para permitir que a balada se atualize.
  // A segurança de "quem pode editar o que" deve estar no Service.
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
  // 🔑 OAUTH MP CONNECT: INICIAR CONEXÃO
  // =========================================================
  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('Erro ao gerar URL MP:', error);
      return res.redirect(`${FRONTEND_URL}/admin/settings?error=mp_url_failed`);
    }
  }

  // =========================================================
  // 🔑 OAUTH MP CONNECT: CALLBACK (Retorno do Mercado Pago)
  // =========================================================
  @Get('mp-callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    // 🛡️ Validação de segurança básica
    if (!code || !nightclubId) {
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?error=mp_auth_failed`,
      );
    }

    try {
      // O Service troca o 'code' por 'access_token' e salva no banco
      await this.nightclubsService.handleMpCallback(code, nightclubId);

      // ✅ Redireciona para o painel da Vercel com sucesso
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?success=mp_connected`,
      );
    } catch (error) {
      console.error('Erro no Callback do MP:', error);
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?error=mp_token_exchange_failed`,
      );
    }
  }
}
