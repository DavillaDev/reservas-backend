// api/src/nightclubs/dto/create-nightclub.dto.ts (FINAL E CORRIGIDO)

import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUrl,
  IsEmail,
  MinLength,
} from 'class-validator';

export class CreateNightclubDto {
  // Dados da Balada
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  whatsapp?: string; // Permitir que seja opcional

  // 🔑 CAMPOS FALTANTES ADICIONADOS AQUI 🔑
  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  mapUrl?: string;

  // Dados do Admin (necessário para o Onboarding, mas cuidado para não salvar no Nightclub)
  @IsNotEmpty()
  @IsEmail()
  adminEmail: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}
