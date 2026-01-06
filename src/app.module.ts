import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from '.././prisma/prisma.service';
import { NightclubsModule } from './nightclubs/nightclubs.module';
import { SpacesModule } from './spaces/spaces.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AuthModule } from './auth/auth.module';
import { UploadController } from './upload.controller';

// 🛡️ Segurança: Rate Limit
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// 🛡️ Cloudinary
import { CloudinaryService } from './cloudinary.service';

// 🛡️ Super Admin
import { SuperController } from './super/super.controller';
import { SuperService } from './super/super.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),

    // 🛡️ Configuração do Rate Limit: 10 requisições por minuto por IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),

    CustomersModule,

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
    CloudinaryService,
    // 🛡️ Aplica a proteção do Throttler globalmente em todas as rotas
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
