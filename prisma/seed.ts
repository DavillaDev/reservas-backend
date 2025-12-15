// api/prisma/seed.ts
import { PrismaClient, UserRole, SpaceType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando o Seed...');

  // 1. Limpar banco (opcional, para evitar duplicidade em testes)
  // await prisma.reservation.deleteMany();
  // await prisma.space.deleteMany();
  // await prisma.user.deleteMany();
  // await prisma.nightclub.deleteMany();

  // 2. Criar a Balada
  const nightclub = await prisma.nightclub.create({
    data: {
      name: 'teste lounge',
      slug: 'teste-lounge',
      whatsapp: '11999999999',
      themeColor: '#ff007f', // Rosa Neon
      appFeePercent: 5.0, // Você ganha 5%
    },
  });

  console.log(`🏢 Balada criada: ${nightclub.name}`);

  // 3. Criar o Dono (Você)
  const passwordHash = await bcrypt.hash('123456', 10); // Senha padrão para testes

  const owner = await prisma.user.create({
    data: {
      email: 'admin@balada.com',
      name: 'Thulio Owner',
      password: passwordHash,
      role: UserRole.OWNER,
      nightclubId: nightclub.id,
    },
  });

  console.log(`👤 Dono criado: ${owner.email} (Senha: 123456)`);

  // 4. Criar Espaços (Inventário)
  await prisma.space.createMany({
    data: [
      {
        name: 'Camarote King',
        type: SpaceType.CAMAROTE,
        capacity: 10,
        price: 2000.0,
        nightclubId: nightclub.id,
      },
      {
        name: 'Mesa Pista 01',
        type: SpaceType.MESA,
        capacity: 4,
        price: 300.0,
        nightclubId: nightclub.id,
      },
    ],
  });

  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
