// api/src/spaces/dto/create-space.dto.ts
import { SpaceType } from '@prisma/client'; // Importa os tipos do banco

export class CreateSpaceDto {
  name: string;
  capacity: number;
  type: SpaceType;
  nightclubId: string;
  price?: number;
  description?: string;
}
