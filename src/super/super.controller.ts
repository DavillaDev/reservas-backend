// src/super/super.controller.ts (FINAL E CORRIGIDO PARA ONBOARDING DTO)

import {
  Controller,
  Post,
  Get,
  Body,
  UnauthorizedException,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SuperService } from './super.service';
import type { Response } from 'express';
import { MasterAuthGuard } from './guards/master-auth.guard';
import { MasterKeyDto } from './dto/master-key.dto';
// 🔑 NOVA IMPORTAÇÃO: O DTO de Onboarding
import { OnboardClubDto } from './dto/onboard-club.dto';

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {} // ================================
  // LOGIN MASTER
  // ================================

  private validateMasterKey(key?: string) {
    if (!key || key !== process.env.MASTER_KEY) {
      throw new UnauthorizedException('Master key inválida.');
    }
  }

  @Post('auth')
  async authenticateMaster(
    @Body() { masterKey }: MasterKeyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateMasterKey(masterKey);

    const sessionToken = `master-${Date.now()}`;

    res.cookie('master_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none', // 🔥 obrigatório Vercel → Render
      maxAge: 1000 * 60 * 60 * 24, // 24h
    });

    return {
      success: true,
      message: 'Sessão mestra estabelecida.',
    };
  } // ================================
  // LOGOUT MASTER
  // ================================

  @Post('logout')
  async logoutMaster(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('master_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    return {
      success: true,
      message: 'Sessão mestra encerrada.',
    };
  } // ================================
  // DASHBOARD (PROTEGIDO)
  // ================================

  @UseGuards(MasterAuthGuard)
  @Get('dashboard')
  async getDashboard() {
    return this.superService.getDashboardData();
  } // ================================
  // ONBOARDING (PROTEGIDO)
  // ================================

  @UseGuards(MasterAuthGuard)
  @Post('onboard') // 🔑 CORREÇÃO: Usando OnboardClubDto para validação e tipagem
  async createClient(@Body() body: OnboardClubDto) {
    return this.superService.onboardClient(body);
  }
}
