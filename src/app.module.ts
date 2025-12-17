import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { NightclubsModule } from './nightclubs/nightclubs.module';
import { SpacesModule } from './spaces/spaces.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AuthModule } from './auth/auth.module';
import { UploadController } from './upload.controller';

// 🛡️ Cloudinary
import { CloudinaryService } from './cloudinary.service';

// 🛡️ Super Admin
import { SuperController } from './super/super.controller';
import { SuperService } from './super/super.service';

// 🚨 IMPORTANTE: Importar o Controller de Nightclubs para registrar as rotas de Callback
import { NightclubsController } from './nightclubs/nightclubs.controller';

@Module({
  imports: [NightclubsModule, SpacesModule, ReservationsModule, AuthModule],
  controllers: [
    AppController,
    UploadController,
    SuperController,
    NightclubsController,
  ],
  providers: [AppService, PrismaService, SuperService, CloudinaryService],
})
export class AppModule {}
