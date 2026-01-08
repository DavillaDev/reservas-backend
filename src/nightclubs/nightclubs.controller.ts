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
  // 1. MERCADO PAGO OAUTH CALLBACK (PÚBLICO)
  // ===========================================================================
  @Get('oauth/callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    try {
      if (!code || !nightclubId) throw new Error('Dados ausentes');

      await this.nightclubsService.handleMpCallback(code, nightclubId);

      // Redireciona de volta para o admin com sucesso
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=success&mp=connected`,
      );
    } catch (error) {
      console.error('Erro no callback MP:', error.message);
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=connection_failed`,
      );
    }
  }

  // ===========================================================================
  // 2. INICIAR CONEXÃO (AJUSTADO PARA FUNCIONAR VIA LINK 🔗)
  // ===========================================================================
  // Removido o JwtAuthGuard aqui porque links <a> não enviam Headers Authorization
  @Get('connect/:id')
  async startMpConnect(@Param('id') nightclubId: string, @Res() res: any) {
    try {
      // Como não temos o req.user aqui (pelo link direto),
      // o generateMpConnectUrl usa o nightclubId como 'state' para o MP.
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      return res.redirect(redirectUrl);
    } catch (error) {
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_url_failed`,
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
