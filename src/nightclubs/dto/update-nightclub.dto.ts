// api/src/nightclubs/dto/update-nightclub.dto.ts (FINAL E CORRIGIDO)

import { PartialType } from '@nestjs/mapped-types';
import { CreateNightclubDto } from './create-nightclub.dto';
import {
  IsOptional,
  IsNumber,
  IsUUID,
  IsUrl,
  ValidateNested,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// 1. CLASSE DE CONFIGURAÇÕES PARA SPLIT E CONTA MP
export class NightclubSettingsDto {
  // 🔑 CRÍTICO: Adiciona a assinatura de índice genérica.
  // Isso resolve o erro 'Index signature for type 'string' is missing'
  // permitindo que o Prisma trate este objeto como um JSON válido.
  [key: string]: any;

  // Opções de Split de Pagamento
  @IsOptional()
  @IsString()
  mpAccountId?: string; // ID da conta Mercado Pago do cliente

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  appFeePercent?: number; // Porcentagem da Plataforma (Você)

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  clubFeePercent?: number; // Porcentagem do Cliente (Balada)
}

// 2. DTO PRINCIPAL DE ATUALIZAÇÃO
export class UpdateNightclubDto extends PartialType(CreateNightclubDto) {
  // Campos de atualização direta
  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  mapUrl?: string;

  // 🔑 Campo JSON: Usa ValidateNested e Type para garantir que o objeto interno seja validado
  @IsOptional()
  @ValidateNested()
  @Type(() => NightclubSettingsDto)
  settings?: NightclubSettingsDto;
}
