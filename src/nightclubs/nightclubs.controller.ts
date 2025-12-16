// api/src/nightclubs/nightclubs.controller.ts (CORRIGIDO E PROTEGIDO)

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards, // 🔑 NOVO: Para usar o Guard
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { MasterAuthGuard } from '../super/guards/master-auth.guard'; // 🔑 Importar o Guard

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {} // Criar nova balada (Normalmente usada no Master, mas não diretamente no Dashboard)
  // 🚨 Esta rota é usada pela rota 'super/onboard', mas a rota 'super/onboard' já deve ser protegida.
  // Se esta rota @Post() for chamada por si só, ela deve ser protegida:

  @UseGuards(MasterAuthGuard)
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  } // Listar todas (Usada pelo Master Dashboard)

  @UseGuards(MasterAuthGuard) // 🔑 Protegida: Somente Master vê todas as baladas
  @Get()
  findAll() {
    return this.nightclubsService.findAll();
  }

  // --- ROTAS PÚBLICAS OU PROTEGIDAS PELO ADMIN LOCAL ---

  // NOVA ROTA: Buscar por Slug (URL) - Normalmente Rota Pública
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  } // Buscar por ID (UUID) - Depende se é pública ou só para Admin/Master

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  } // --- ROTAS DE OPERAÇÃO MASTER ---
  // Atualizar (Usada pelo Master Dashboard)

  @UseGuards(MasterAuthGuard) // 🔑 Protegida: Somente Master pode atualizar
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    return this.nightclubsService.update(id, updateNightclubDto);
  } // Deletar (Usada pelo Master Dashboard)

  @UseGuards(MasterAuthGuard) // 🔑 Protegida: Somente Master pode deletar
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nightclubsService.remove(id);
  }
}
