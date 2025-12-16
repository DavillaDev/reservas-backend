// src/super/dto/master-key.dto.ts

import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class MasterKeyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'A chave mestra deve ter no mínimo 5 caracteres.' })
  masterKey: string;
}
