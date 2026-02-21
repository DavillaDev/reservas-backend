import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService], // Exportamos caso outro módulo precise acessar os pagamentos no futuro
})
export class PaymentsModule {}
