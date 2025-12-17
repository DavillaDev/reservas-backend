import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { NightclubsModule } from './nightclubs/nightclubs.module';
import { SpacesModule } from './spaces/spaces.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AuthModule } from './auth/auth.module';
import { UploadController } from './upload.controller';

// 🛡️ NOVO: Importe o serviço do Cloudinary
import { CloudinaryService } from './cloudinary.service';

import { SuperController } from './super/super.controller';
import { SuperService } from './super/super.service';

@Module({
  imports: [
    // 💡 REMOVEMOS o ServeStaticModule pois não usaremos mais a pasta 'uploads' local
    NightclubsModule,
    SpacesModule,
    ReservationsModule,
    AuthModule,
  ],
  controllers: [AppController, UploadController, SuperController],
  providers: [
    AppService,
    PrismaService,
    SuperService,
    CloudinaryService, // 🛡️ ADICIONADO: CloudinaryService agora está disponível para a API
  ],
})
export class AppModule {}
