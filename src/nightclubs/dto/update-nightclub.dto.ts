// api/src/nightclubs/dto/update-nightclub.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateNightclubDto } from './create-nightclub.dto';

export class UpdateNightclubDto extends PartialType(CreateNightclubDto) {
  // Adicionando os campos que queremos permitir editar
  themeColor?: string;
  logoUrl?: string;
  mapUrl?: string;
  settings?: any; // Para permitir editar o JSON de regras
}
