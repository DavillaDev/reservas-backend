// api/src/spaces/spaces.service.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common'; // 🔑 Importação corrigida
import { PrismaService } from '../prisma.service'; // 🔑 Garante que o caminho está correto
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  // 1. Criar Espaço
  async create(createSpaceDto: CreateSpaceDto) {
    try {
      return await this.prisma.space.create({
        data: {
          name: createSpaceDto.name,
          capacity: Number(createSpaceDto.capacity),
          type: createSpaceDto.type,
          nightclubId: createSpaceDto.nightclubId,
          status: 'ACTIVE',
          price: Number(createSpaceDto.price || 0),
          description: createSpaceDto.description || '',
        },
      });
    } catch (error) {
      console.error('Erro Prisma:', error);
      throw new InternalServerErrorException('Erro ao criar espaço no banco.');
    }
  }

  // 2. Listar Todos (Necessário para o Controller)
  async findAll() {
    return this.prisma.space.findMany();
  }

  // 3. Buscar por ID
  async findOne(id: string) {
    return this.prisma.space.findUnique({
      where: { id },
    });
  }

  // 4. Buscar por Balada
  async findByNightclub(nightclubId: string) {
    return this.prisma.space.findMany({
      where: { nightclubId },
    });
  }

  // 5. Atualizar
  async update(id: string, updateSpaceDto: UpdateSpaceDto) {
    return this.prisma.space.update({
      where: { id },
      data: {
        ...updateSpaceDto,
        // Garante conversão se os valores vierem no DTO
        capacity: updateSpaceDto.capacity
          ? Number(updateSpaceDto.capacity)
          : undefined,
        price: updateSpaceDto.price ? Number(updateSpaceDto.price) : undefined,
      },
    });
  }

  // 6. Remover
  async remove(id: string) {
    return this.prisma.space.delete({
      where: { id },
    });
  }
}
