import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
} from 'class-validator';

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
}
