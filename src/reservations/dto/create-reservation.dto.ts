// api/src/reservations/dto/create-reservation.dto.ts

export class CreateReservationDto {
  // Campos Obrigatórios (Base)
  nightclubId: string;
  spaceId: string;
  customerName: string;
  customerPhone: string;
  date: string; // Formato YYYY-MM-DD

  // Novos Campos (Vindos do seu Formulário HTML)
  customerEmail?: string; // Email do cliente

  isBirthday?: boolean; // Checkbox "É aniversário?"
  birthdayDate?: string; // Data de nascimento (para validar regra)

  notes?: string; // Observações / Pedidos especiais

  checkInTime?: string; // Horário de chegada (ISO String)
}
