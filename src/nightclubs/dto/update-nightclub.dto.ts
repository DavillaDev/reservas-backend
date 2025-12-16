// api/src/nightclubs/dto/update-nightclub.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateNightclubDto } from './create-nightclub.dto';
import {
  IsOptional,
  IsNumber,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NightclubSettingsDto {
  [key: string]: any;

  @IsOptional()
  @IsString()
  mpAccountId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  appFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  clubFeePercent?: number;
}

export class UpdateNightclubDto extends PartialType(CreateNightclubDto) {
  @IsOptional()
  @IsString()
  themeColor?: string;

  // 🔑 AQUI ESTÁ A CORREÇÃO
  @IsOptional()
  @IsString()
  logoUrl?: string;

  // 🔑 AQUI TAMBÉM
  @IsOptional()
  @IsString()
  mapUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NightclubSettingsDto)
  settings?: NightclubSettingsDto;
}
