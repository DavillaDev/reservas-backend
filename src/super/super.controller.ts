import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { SuperService } from './super.service';

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {}

  // Validação centralizada e segura
  private validateKey(masterKey?: string) {
    if (!masterKey) {
      throw new UnauthorizedException('Master key ausente');
    }

    if (!process.env.MASTER_KEY) {
      throw new Error('MASTER_KEY não configurada no ambiente');
    }

    if (masterKey !== process.env.MASTER_KEY) {
      throw new UnauthorizedException('Master key inválida');
    }
  }

  @Post('onboard')
  async createClient(
    @Body() body: any,
    @Headers('x-master-key') masterKey: string,
  ) {
    this.validateKey(masterKey);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload inválido');
    }

    return this.superService.onboardClient(body);
  }

  @Get('dashboard')
  async getDashboard(@Headers('x-master-key') masterKey: string) {
    this.validateKey(masterKey);
    return this.superService.getDashboardData();
  }
}
