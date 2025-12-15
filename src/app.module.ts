// api/src/app.module.ts
import { Module } from '@nestjs/common';
// 👈 NOVO: Imports para servir arquivos estáticos
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
// FIM NOVOS IMPORTS

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { NightclubsModule } from './nightclubs/nightclubs.module';
import { SpacesModule } from './spaces/spaces.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AuthModule } from './auth/auth.module';
import { UploadController } from './upload.controller';

// Imports do God Mode (se você usou o meu código anterior)
import { SuperController } from './super/super.controller';
import { SuperService } from './super/super.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads/',
    }),

    NightclubsModule,
    SpacesModule,
    ReservationsModule,
    AuthModule,
  ],
  controllers: [AppController, UploadController, SuperController],
  providers: [AppService, PrismaService, SuperService],
})
export class AppModule {}
