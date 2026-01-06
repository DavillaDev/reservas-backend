import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler'; // 🛡️ Importe o Throttle

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 🛡️ Sobrescreve o limite global: Máximo de 5 tentativas a cada 60 segundos
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    // Chama o service que valida na tabela User e gera o Token
    return this.authService.login(signInDto.email, signInDto.password);
  }
}
