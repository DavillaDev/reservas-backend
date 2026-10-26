import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do lote é obrigatório' })
  name!: string; // Ex: "1º Lote - Unissex"

  @IsNumber({}, { message: 'O preço deve ser um número válido' })
  @IsPositive({ message: 'O preço deve ser maior que zero' })
  price!: number;

  @IsNumber({}, { message: 'A quantidade total deve ser um número válido' })
  @IsPositive({ message: 'A quantidade total deve ser maior que zero' })
  totalQuantity!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
