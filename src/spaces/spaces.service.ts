import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
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

  async findAll() {
    return this.prisma.space.findMany();
  }

  async findByNightclub(nightclubId: string) {
    // 🛡️ Removido o orderBy para evitar erro de propriedade inexistente (createdAt)
    return this.prisma.space.findMany({
      where: { nightclubId },
    });
  }

  async findOne(id: string) {
    return this.prisma.space.findUnique({ where: { id } });
  }

  async update(id: string, updateSpaceDto: UpdateSpaceDto) {
    return this.prisma.space.update({
      where: { id },
      data: {
        ...updateSpaceDto,
        type: updateSpaceDto.type
          ? (updateSpaceDto.type as SpaceType)
          : undefined,
      },
    });
  }

  /**
   * 🛡️ REMOÇÃO FORÇADA (CASCADE MANUAL)
   * Deleta todas as reservas vinculadas antes de apagar o espaço.
   */
  async remove(id: string) {
    try {
      // 1. Limpa as reservas para evitar erro de Foreign Key (P2003)
      // Fazemos isso primeiro para que o dono consiga deletar o espaço "na marra"
      await this.prisma.reservation.deleteMany({
        where: { spaceId: id },
      });

      // 2. Apaga o espaço definitivamente
      return await this.prisma.space.delete({
        where: { id },
      });
    } catch (error: any) {
      console.error('ERRO AO DELETAR ESPAÇO:', error.message);
      throw new InternalServerErrorException(
        'Erro ao excluir o espaço e suas dependências.',
      );
    }
  }
}
