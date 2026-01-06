import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomersService } from './costumers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard) // 🔒 Só entra com crachá
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // GET /customers -> Lista os clientes da balada do Admin logado
  @Get()
  findAll(@Request() req: any) {
    // Pega o ID da balada de dentro do token do usuário logado
    const nightclubId = req.user.nightclubId;
    return this.customersService.findAllByNightclub(nightclubId);
  }

  // PATCH /customers/:id/toggle-block -> O Botão da Blacklist
  @Patch(':id/toggle-block')
  toggleBlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.toggleBlock(id);
  }
}
