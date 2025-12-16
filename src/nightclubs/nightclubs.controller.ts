// api/src/nightclubs/nightclubs.controller.ts (ATUALIZADO PARA OAUTH MP CONNECT)

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Res, // 🔑 NOVO: Para redirecionamento HTTP
  Query, // 🔑 NOVO: Para capturar parâmetros da URL de retorno do MP
  Redirect, // 🔑 NOVO: Para redirecionar para a URL de OAuth
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { MasterAuthGuard } from '../super/guards/master-auth.guard';
// 🚨 Nota: Assumimos a existência de um AdminAuthGuard para o Admin local,
// mas usaremos apenas a validação no serviço por enquanto.

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {} // --- ROTAS PROTEGIDAS PELO MASTER ADMIN ---
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
  } // --- ROTAS PÚBLICAS OU PROTEGIDAS PELO ADMIN LOCAL ---

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  } // =========================================================
  // 🔑 NOVA ROTA: INICIAR CONEXÃO OAUTH MP CONNECT (Redirecionamento)
  // =========================================================
  // Esta rota deve ser chamada pelo Front-end Admin Local

  @Get('connect/:id')
  async startMpConnect(
    @Param('id') nightclubId: string,
    @Res() res: any, // Usamos 'any' aqui para facilitar a injeção do Express Response
  ) {
    // O Service gera a URL de OAuth e faz o redirecionamento
    const redirectUrl =
      await this.nightclubsService.generateMpConnectUrl(nightclubId); // Redireciona o usuário para o Mercado Pago
    return res.redirect(redirectUrl);
  } // =========================================================
  // 🔑 NOVA ROTA: CALLBACK MP CONNECT (Mercado Pago Retorna Aqui)
  // =========================================================
  // Esta é a rota configurada no painel do MP (Redirect URI)
  @Get('mp-callback')
  async handleMpCallback(
    @Query('code') code: string,
    @Query('state') nightclubId: string, // O 'state' é o ID da balada que enviamos antes
    @Res() res: any,
  ) {
    if (!code || !nightclubId) {
      // Em caso de erro ou parâmetros ausentes, redireciona para o painel com erro.
      return res.redirect('/admin/settings?error=mp_auth_failed');
    }

    try {
      // O Service processa o código e salva o access_token/user_id do cliente
      await this.nightclubsService.handleMpCallback(code, nightclubId); // Redireciona o cliente de volta para o painel de Configurações, com sucesso.

      return res.redirect('/admin/settings?success=mp_connected');
    } catch (error) {
      console.error('Erro no Callback do MP:', error);
      return res.redirect('/admin/settings?error=mp_token_exchange_failed');
    }
  }
}
