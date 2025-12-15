import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NightclubsService {
  constructor(private prisma: PrismaService) {}

  // 1. CRIAR
  async create(createNightclubDto: any) {
    const { name, slug, whatsapp, themeColor, logoUrl, mapUrl } =
      createNightclubDto;

    return this.prisma.nightclub.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        whatsapp: whatsapp || '',
        themeColor,
        logoUrl,
        mapUrl,
      },
    });
  }

  // 2. LISTAR TODAS (CORRIGIDO: Agora traz os Espaços junto!)
  findAll() {
    return this.prisma.nightclub.findMany({
      include: {
        spaces: true, // 👈 O PULO DO GATO ESTÁ AQUI
      },
    });
  }

  // 3. BUSCAR UMA POR ID (CORRIGIDO)
  findOne(id: string) {
    return this.prisma.nightclub.findUnique({
      where: { id },
      include: {
        spaces: { orderBy: { name: 'asc' } }, // Traz espaços ordenados por nome
      },
    });
  }

  // 4. BUSCAR PELO SLUG (Página Pública)
  findBySlug(slug: string) {
    return this.prisma.nightclub.findUnique({
      where: { slug },
      include: {
        spaces: {
          where: { status: 'ACTIVE' }, // Só mostra mesas ativas para o cliente
          orderBy: { price: 'asc' },
        },
      },
    });
  }

  // 5. ATUALIZAR
  update(id: string, updateNightclubDto: any) {
    return this.prisma.nightclub.update({
      where: { id },
      data: updateNightclubDto,
      include: { spaces: true }, // Retorna atualizado já com os espaços
    });
  }

  // 6. DELETAR
  async remove(id: string) {
    // ⚠️ CRÍTICO: TRANSAÇÃO PARA EXCLUSÃO EM CASCATA
    // Deletar o pai (Nightclub) exige que os filhos sejam deletados primeiro.
    return this.prisma.$transaction(async (tx) => {
      // 1. Deletar Reservas (filho do Nightclub)
      await tx.reservation.deleteMany({
        where: { nightclubId: id },
      });

      // 2. Deletar Espaços (filho do Nightclub)
      await tx.space.deleteMany({
        where: { nightclubId: id },
      });

      // 3. Deletar Usuários (filho do Nightclub)
      await tx.user.deleteMany({
        where: { nightclubId: id },
      });

      // 4. Deletar a Balada (Nightclub)
      const nightclub = await tx.nightclub.delete({
        where: { id },
      });

      return nightclub; // Retorna o objeto excluído
    });
  }
}
