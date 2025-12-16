// src/super/dto/onboard-club.dto.ts (NOVO ARQUIVO)

import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// 1. Definição das Configurações Iniciais (Taxas de Split)
export class OnboardSettingsDto {
  // Assinatura de índice para compatibilidade com Prisma JSON
  [key: string]: any;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  appFeePercent?: number; // Ex: 10 (Sua taxa)

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  clubFeePercent?: number; // Ex: 90 (Taxa do cliente)

  // Outras configurações (ex: pagamento ativo, status inicial, etc.)
}

// 2. DTO Principal para Onboarding
export class OnboardClubDto {
  // Dados Básicos da Balada
  @IsNotEmpty()
  @IsString()
  clubName: string; // O nome completo (ex: Nightclub Main SP)

  @IsNotEmpty()
  @IsString()
  slug: string; // O slug/url (ex: main-sp)

  // Credenciais do Admin
  @IsNotEmpty()
  @IsString()
  ownerName: string; // Nome do primeiro admin (ex: "Admin Principal")

  @IsNotEmpty()
  @IsEmail()
  ownerEmail: string; // Email do primeiro admin

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  ownerPassword: string; // Senha do primeiro admin

  // 🔑 Configurações de Split (Opcional no Onboarding)
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardSettingsDto)
  settings?: OnboardSettingsDto;
}
