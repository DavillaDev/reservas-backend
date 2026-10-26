import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty({ message: 'O ID do lote é obrigatório' })
  batchId!: string;

  @IsNumber({}, { message: 'A quantidade deve ser um número válido' })
  @IsPositive({ message: 'A quantidade deve ser maior que zero' })
  quantity!: number;

  @IsString()
  @IsNotEmpty({ message: 'O nome do cliente é obrigatório' })
  customerName!: string;

  @IsString()
  @IsNotEmpty({ message: 'O telefone do cliente é obrigatório' })
  customerPhone!: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerCpf?: string;
}
