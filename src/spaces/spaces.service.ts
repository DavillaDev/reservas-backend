// api/src/spaces/spaces.service.ts

import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
// 🔑 IMPORTANTE: Importar o Enum gerado pelo Prisma
import { SpaceType } from '@prisma/client';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  async create(createSpaceDto: CreateSpaceDto) {
    console.log(
      '--- DTO RECEBIDO NO SERVICE ---',
      JSON.stringify(createSpaceDto),
    );

    if (!createSpaceDto.name || !createSpaceDto.nightclubId) {
      throw new BadRequestException(
        'Dados obrigatórios faltando: Nome ou NightclubID',
      );
    }

    try {
      return await this.prisma.space.create({
        data: {
          name: String(createSpaceDto.name),
          // 🔑 SOLUÇÃO: Fazemos o cast para 'SpaceType' para satisfazer o TypeScript
          type: createSpaceDto.type as SpaceType,
          capacity: Number(createSpaceDto.capacity) || 1,
          price: Number(createSpaceDto.price) || 0,
          description: String(createSpaceDto.description || ''),
          status: 'ACTIVE',
          nightclubId: String(createSpaceDto.nightclubId),
        },
      });
    } catch (error: any) {
      console.error('ERRO CRÍTICO NO PRISMA:', error.message);
      throw new InternalServerErrorException('Erro ao criar espaço no banco.');
    }
  }

  // ... (mantenha os outros métodos iguais)

  async findAll() {
    return this.prisma.space.findMany();
  }

  async findByNightclub(nightclubId: string) {
    return this.prisma.space.findMany({ where: { nightclubId } });
  }

  async findOne(id: string) {
    return this.prisma.space.findUnique({ where: { id } });
  }

  async update(id: string, updateSpaceDto: UpdateSpaceDto) {
    return this.prisma.space.update({
      where: { id },
      data: {
        ...updateSpaceDto,
        // Caso o 'type' venha no update, também precisa do cast
        type: updateSpaceDto.type
          ? (updateSpaceDto.type as SpaceType)
          : undefined,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.space.delete({ where: { id } });
  }
}
