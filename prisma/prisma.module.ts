import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // <--- Isso é importante! Deixa o Prisma disponivel no app todo
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
