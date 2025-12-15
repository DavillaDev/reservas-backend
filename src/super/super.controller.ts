import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SuperService } from './super.service';

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {}

  // Validação simples de chave
  private validateKey(key: string) {
    const validKey = process.env.MASTER_KEY || 'segredo123';
    if (key !== validKey) {
      throw new UnauthorizedException('Sai daqui, curioso! 🚫');
    }
  }

  @Post('onboard')
  async createClient(
    @Body() body: any,
    @Headers('x-master-key') masterKey: string,
  ) {
    this.validateKey(masterKey);
    return this.superService.onboardClient(body);
  }

  @Get('dashboard')
  async getDashboard(@Headers('x-master-key') masterKey: string) {
    this.validateKey(masterKey);
    return this.superService.getDashboardData();
  }
}
