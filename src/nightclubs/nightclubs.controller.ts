// src/nightclubs/nightclubs.controller.ts
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
  Request, // Adicionado para pegar o usuário do Token
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // 🛡️ Importe seu Guard de JWT

const FRONTEND_URL = 'https://reservasclub.com.br';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // Callback deve ser público pois o Mercado Pago quem chama,
  // mas o 'state' (ID) garante a integridade
  @Get('oauth/callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string,
    @Res() res: any,
  ) {
    // ... lógica atual ...
  }

  // 🔑 PROTEGIDO: Só inicia conexão se estiver logado
  @UseGuards(JwtAuthGuard)
  @Get('connect/:id')
  async startMpConnect(
    @Param('id') nightclubId: string,
    @Request() req: any, // Pegamos o user do token
    @Res() res: any,
  ) {
    // 🛡️ TRAVA DE OURO: Verifica se o ID solicitado é o mesmo do token do usuário
    if (req.user.nightclubId !== nightclubId) {
      throw new UnauthorizedException(
        'Você não tem permissão para alterar esta conta.',
      );
    }

    try {
      const redirectUrl =
        await this.nightclubsService.generateMpConnectUrl(nightclubId);
      return res.redirect(redirectUrl);
    } catch (error) {
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?status=error&message=mp_url_failed`,
      );
    }
  }

  // --- CRUD SEGURO ---

  @UseGuards(MasterAuthGuard) // Apenas você (Super Admin) cria baladas
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  // 🛡️ PROTEGIDO: O dono só pode editar a sua própria balada
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    if (req.user.nightclubId !== id) {
      throw new UnauthorizedException('Ação não permitida para sua conta.');
    }
    return this.nightclubsService.update(id, updateNightclubDto);
  }

  // Recomendo proteger o findOne também para evitar vazamento de dados
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
