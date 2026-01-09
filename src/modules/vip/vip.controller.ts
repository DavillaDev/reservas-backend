import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { VipService } from './vip.service';

@Controller('vip')
export class VipController {
  constructor(private readonly vipService: VipService) {}

  // ===========================================================================
  // 🛡️ ROTAS DO DONO (DASHBOARD)
  // ===========================================================================

  // Gerar um novo código VIP
  @Post('token')
  async createToken(
    @Body('nightclubId') nightclubId: string,
    @Body('maxGuests', ParseIntPipe) maxGuests: number,
    @Body('expiresAt') expiresAt: string,
  ) {
    return this.vipService.createToken(
      nightclubId,
      maxGuests,
      new Date(expiresAt),
    );
  }

  // Listar todos os códigos gerados pela balada
  @Get('tokens/:nightclubId')
  async getTokens(@Param('nightclubId') nightclubId: string) {
    return this.vipService.getTokensByNightclub(nightclubId);
  }

  // Ver convidados de uma lista específica (Portaria)
  @Get('guests/:tokenId')
  async getGuests(@Param('tokenId') tokenId: string) {
    return this.vipService.getGuestsByToken(tokenId);
  }

  // ===========================================================================
  // 📱 ROTAS DO CLIENTE (LINK DA BIO/PROMOTER)
  // ===========================================================================

  // Cliente envia o nome para o código recebido
  @Post('join')
  async joinList(
    @Body('code') code: string,
    @Body('name') name: string,
    @Body('phone') phone?: string,
  ) {
    return this.vipService.addGuest(code, name, phone);
  }
}
