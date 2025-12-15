// api/src/nightclubs/nightclubs.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { NightclubsService } from './nightclubs.service';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';

@Controller('nightclubs')
export class NightclubsController {
  constructor(private readonly nightclubsService: NightclubsService) {}

  // Criar nova balada
  @Post()
  create(@Body() createNightclubDto: CreateNightclubDto) {
    return this.nightclubsService.create(createNightclubDto);
  }

  // Listar todas (Admin)
  @Get()
  findAll() {
    return this.nightclubsService.findAll();
  }

  // NOVA ROTA: Buscar por Slug (URL)
  // Ex: GET http://localhost:3000/nightclubs/slug/balada-yara
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.nightclubsService.findBySlug(slug);
  }

  // Buscar por ID (UUID)
  // Ex: GET http://localhost:3000/nightclubs/1234-5678...
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nightclubsService.findOne(id); // Sem o "+"
  }

  // Atualizar
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNightclubDto: UpdateNightclubDto,
  ) {
    return this.nightclubsService.update(id, updateNightclubDto); // Sem o "+"
  }

  // Deletar
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nightclubsService.remove(id); // Sem o "+"
  }
}
