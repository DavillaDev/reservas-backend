// api/src/spaces/spaces.service.ts
import { Injectable } from '@nestjs/common';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  // 1. Criar Espaço (Com Preço e Descrição)
  create(createSpaceDto: CreateSpaceDto) {
    return this.prisma.space.create({
      data: {
        name: createSpaceDto.name,
        capacity: createSpaceDto.capacity,
        type: createSpaceDto.type,
        nightclubId: createSpaceDto.nightclubId,
        status: 'ACTIVE',

        // Novos campos financeiros e informativos
        price: createSpaceDto.price || 0,
        description: createSpaceDto.description || '',
      },
    });
  }

  // 2. Listar Todos
  findAll() {
    return this.prisma.space.findMany();
  }

  // 3. Buscar por ID
  findOne(id: string) {
    return this.prisma.space.findUnique({
      where: { id },
    });
  }

  // 4. Buscar por Balada (Útil se precisar filtrar no futuro)
  findByNightclub(nightclubId: string) {
    return this.prisma.space.findMany({
      where: { nightclubId },
    });
  }

  // 5. Atualizar (Agora funciona de verdade para o Painel de Configurações)
  update(id: string, updateSpaceDto: UpdateSpaceDto) {
    return this.prisma.space.update({
      where: { id },
      data: updateSpaceDto, // O Prisma atualiza apenas o que vier preenchido (price, capacity, description, etc)
    });
  }

  // 6. Remover
  remove(id: string) {
    return this.prisma.space.delete({
      where: { id },
    });
  }
}
