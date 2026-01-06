// api/src/spaces/dto/create-space.dto.ts
import { SpaceType } from '@prisma/client'; // Importa os tipos do banco

export class CreateSpaceDto {
  name: string;
  type: string;
  capacity: number;
  price: number;
  description?: string;
  nightclubId: string;
}
