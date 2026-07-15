import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateReservationDto {
  // =========================================================
  // Campos Obrigatórios (Base)
  // =========================================================
  @IsString()
  @IsNotEmpty()
  nightclubId!: string;

  @IsString()
  @IsNotEmpty()
  spaceId!: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsString()
  @IsNotEmpty()
  date!: string; // Formato YYYY-MM-DD

  // =========================================================
  // Campos Opcionais / Novos Campos
  // =========================================================
  @IsOptional()
  @IsString()
  customerEmail?: string; // Email do cliente

  @IsOptional()
  @IsBoolean()
  isBirthday?: boolean; // Checkbox "É aniversário?"

  // 🛡️ Mantemos como opcional no DTO, pois a validação de obrigatoriedade
  // (+18) agora acontece dinamicamente lá no reservations.service.ts!
  @IsOptional()
  @IsString()
  birthdayDate?: string;

  @IsOptional()
  @IsString()
  notes?: string; // Observações / Pedidos especiais

  @IsOptional()
  @IsString()
  checkInTime?: string; // Horário de chegada (ISO String)

  @IsOptional()
  @IsString()
  promoterId?: string; // ID do Promoter que gerou a reserva via link
}
