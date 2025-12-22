import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 👈 ADICIONE ESTA LINHA
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from '.././prisma/prisma.service';
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
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    // 🛡️ Inicializa o ConfigModule globalmente para todos os outros módulos
    ConfigModule.forRoot({ isGlobal: true }),
    NightclubsModule,
    SpacesModule,
    ReservationsModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    UploadController,
    SuperController,
    // ❌ NightclubsController removido daqui para evitar o erro de dependência (UnknownDependencies)
  ],
  providers: [AppService, PrismaService, SuperService, CloudinaryService],
})
export class AppModule {}
