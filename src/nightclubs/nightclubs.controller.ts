// api/src/nightclubs/nightclubs.controller.ts (FINALIZADO E PROTEGIDO)

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards, // 🔑 Importado para usar o Guard
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';

// 🔑 Importamos o MasterAuthGuard para proteger as rotas CRUD
import { MasterAuthGuard } from '../super/guards/master-auth.guard';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {} // --- ROTAS PROTEGIDAS PELO MASTER ADMIN ---
  // Criar nova balada

  @UseGuards(MasterAuthGuard) // 🔑 Protegida: Somente Master pode criar
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  } // Listar todas (Usada pelo Master Dashboard)

  @UseGuards(MasterAuthGuard) // 🔑 Protegida: Somente Master vê todas as baladas
  @Get()
  findAll() {
    return this.nightclubsService.findAll();
  } // Atualizar (Usada pelo Master Dashboard)

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
  } // --- ROTAS PÚBLICAS OU PROTEGIDAS PELO ADMIN LOCAL (Se houver) ---
  // Buscar por Slug (URL) - Mantida pública ou protegida por outro Guard

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  } // Buscar por ID (UUID) - Mantida pública ou protegida por outro Guard

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id);
  }
}
