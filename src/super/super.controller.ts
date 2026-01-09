import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UnauthorizedException,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SuperService } from './super.service';
import type { Response } from 'express';
import { MasterAuthGuard } from './guards/master-auth.guard';
import { MasterKeyDto } from './dto/master-key.dto';
import { OnboardClubDto } from './dto/onboard-club.dto';

@Controller('super')
export class SuperController {
  constructor(private readonly superService: SuperService) {}

  // ===========================================================================
  // 1. LOGIN MASTER
  // ===========================================================================
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
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 24, // 24h
    });

    return {
      success: true,
      message: 'Sessão mestra estabelecida.',
    };
  }

  // ===========================================================================
  // 2. LOGOUT MASTER
  // ===========================================================================
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
  }

  // ===========================================================================
  // 3. DASHBOARD (PROTEGIDO)
  // ===========================================================================
  @UseGuards(MasterAuthGuard)
  @Get('dashboard')
  async getDashboard() {
    return this.superService.getDashboardData();
  }

  // ===========================================================================
  // 4. ONBOARDING (CRIAR CLIENTE)
  // ===========================================================================
  @UseGuards(MasterAuthGuard)
  @Post('onboard')
  async createClient(@Body() body: OnboardClubDto) {
    return this.superService.onboardClient(body);
  }

  // ===========================================================================
  // 5. RESETAR SENHA (ADMIN FORCE) 🔑
  // ===========================================================================
  @UseGuards(MasterAuthGuard)
  @Post('nightclubs/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    return this.superService.resetClubPassword(id, body.password);
  }

  // ===========================================================================
  // 6. IMPERSONATE (LOGIN DIRETO) 🚀 [NOVO]
  // ===========================================================================
  @UseGuards(MasterAuthGuard)
  @Post('impersonate/:id')
  async impersonate(@Param('id') id: string) {
    // Esse método vai retornar um JWT válido como se você fosse o dono da balada
    const accessToken = await this.superService.generateImpersonateToken(id);
    return { accessToken };
  }
}
