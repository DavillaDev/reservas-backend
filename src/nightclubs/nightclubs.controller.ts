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

// 🛡️ Certifique-se que esta URL é exatamente a do seu Admin na Vercel
const FRONTEND_URL = 'https://reservas-two-alpha.vercel.app';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

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
  // 🔑 INICIAR CONEXÃO OAUTH MP
  // =========================================================
  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      console.log(`🚀 Iniciando conexão MP para balada: ${nightclubId}`);
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Erro ao gerar URL MP:', error);
      return res.redirect(`${FRONTEND_URL}/admin/settings?error=mp_url_failed`);
    }
  }

  // =========================================================
  // 🔑 CALLBACK (Onde o Mercado Pago te devolve o CODE)
  // =========================================================
  @Get('mp-callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    console.log('🔔 Callback MP recebido!', {
      code: code?.substring(0, 10) + '...',
      nightclubId,
    });

    if (!code || !nightclubId) {
      console.error('❌ Code ou NightclubID ausentes no callback');
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?error=mp_auth_failed`,
      );
    }

    try {
      // O segredo está aqui: Se o Service falhar, ele cai no catch.
      await this.nightclubsService.handleMpCallback(code, nightclubId);

      console.log('✅ Conexão MP finalizada com sucesso!');
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?success=mp_connected`,
      );
    } catch (error) {
      // 🚨 Se cair aqui, precisamos olhar o log do Render para ver o erro do Service
      console.error(
        '❌ Erro fatal no handleMpCallback do Controller:',
        error.message,
      );
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?error=mp_token_exchange_failed`,
      );
    }
  }
}
