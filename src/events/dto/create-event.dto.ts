// src/events/dto/create-event.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBatchInlineDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do lote é obrigatório' })
  name!: string;

  @IsNumber({}, { message: 'O preço deve ser um número válido' })
  @IsNotEmpty({ message: 'O preço do lote é obrigatório' })
  price!: number;

  @IsNumber({}, { message: 'A quantidade deve ser um número válido' })
  @IsNotEmpty({ message: 'A quantidade do lote é obrigatória' })
  totalQuantity!: number;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty({ message: 'O título do evento é obrigatório' })
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsDateString({}, { message: 'A data do evento deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data do evento é obrigatória' })
  eventDate!: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateBatchInlineDto)
  batches?: CreateBatchInlineDto[];
}
