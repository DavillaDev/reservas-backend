// api/src/spaces/spaces.service.ts

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  async create(createSpaceDto: CreateSpaceDto) {
    // 💡 Log para verificar no Render o que realmente está chegando
    console.log('--- NOVO ESPAÇO PAYLOAD ---', createSpaceDto);

    try {
      return await this.prisma.space.create({
        data: {
          name: createSpaceDto.name,
          capacity: Number(createSpaceDto.capacity), // Converte para número por segurança
          type: createSpaceDto.type,
          nightclubId: createSpaceDto.nightclubId,
          status: 'ACTIVE',
          price: Number(createSpaceDto.price || 0),
          description: createSpaceDto.description || '',
        },
      });
    } catch (error) {
      console.error('ERRO PRISMA AO CRIAR ESPAÇO:', error);
      throw error;
    }
  }
}
