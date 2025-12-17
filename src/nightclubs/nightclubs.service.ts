import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { classToPlain } from 'class-transformer';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { CreateNightclubDto } from './dto/create-nightclub.dto';

// URLs fixas do Mercado Pago
const MP_OAUTH_BASE_URL = 'https://auth.mercadopago.com/authorization';
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

interface MpTokenResponse {
  access_token: string;
  user_id: number;
  public_key: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable()
export class NightclubsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // 1. CRIAR BALADA
  async create(createNightclubDto: CreateNightclubDto) {
    const { name, slug, whatsapp, themeColor, logoUrl, mapUrl } =
      createNightclubDto;

    return this.prisma.nightclub.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        whatsapp: whatsapp || '',
        themeColor: themeColor || '#6366f1',
        logoUrl,
        mapUrl,
      },
    });
  }

  // 2. LISTAR TODAS
  findAll() {
    return this.prisma.nightclub.findMany({
      include: {
        spaces: true,
        users: { select: { id: true } },
      },
    });
  }

  // 3. BUSCAR POR ID
  findOne(id: string) {
    return this.prisma.nightclub.findUnique({
      where: { id },
      include: {
        spaces: { orderBy: { name: 'asc' } },
      },
    });
  }

  // 4. BUSCAR POR SLUG (Página Pública)
  findBySlug(slug: string) {
    return this.prisma.nightclub.findUnique({
      where: { slug },
      include: {
        spaces: {
          where: { status: 'ACTIVE' },
          orderBy: { price: 'asc' },
        },
      },
    });
  }

  // 5. ATUALIZAR
  async update(id: string, updateNightclubDto: UpdateNightclubDto) {
    const { settings, ...restOfData } = updateNightclubDto;
    const dataToUpdate: any = { ...restOfData };

    if (settings) {
      // Garantimos que o settings seja um objeto plano para o campo JSON do Prisma
      dataToUpdate.settings = classToPlain(settings);
    }

    return this.prisma.nightclub.update({
      where: { id },
      data: dataToUpdate,
      include: { spaces: true },
    });
  }

  // 6. DELETAR (Cascata Manual via Transação)
  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reservation.deleteMany({ where: { nightclubId: id } });
      await tx.space.deleteMany({ where: { nightclubId: id } });
      await tx.user.deleteMany({ where: { nightclubId: id } });

      return tx.nightclub.delete({ where: { id } });
    });
  }

  // ===========================================================================
  // 7. MERCADO PAGO: GERAR URL DE CONEXÃO
  // ===========================================================================
  async generateMpConnectUrl(nightclubId: string): Promise<string> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !redirectUri) {
      throw new InternalServerErrorException(
        'Configurações MP_CLIENT_ID ou MP_REDIRECT_URI_NIGHTCLUB ausentes.',
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state: nightclubId,
    });

    return `${MP_OAUTH_BASE_URL}?${params.toString()}`;
  }

  // ===========================================================================
  // 8. MERCADO PAGO: CALLBACK E SALVAMENTO DE TOKEN
  // ===========================================================================
  async handleMpCallback(code: string, nightclubId: string): Promise<void> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const clientSecret = this.configService.get('MP_CLIENT_SECRET');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        'Credenciais MP ausentes no servidor.',
      );
    }

    try {
      // 1. TROCAR CODE POR ACCESS_TOKEN
      const tokenResponse = await axios.post<MpTokenResponse>(MP_TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const { access_token, user_id, public_key } = tokenResponse.data;

      // 2. BUSCAR CONFIGURAÇÕES ATUAIS
      const nightclub = await this.prisma.nightclub.findUnique({
        where: { id: nightclubId },
        select: { settings: true },
      });

      if (!nightclub) throw new NotFoundException('Balada não encontrada.');

      // 3. MESCLAR NOVOS DADOS NO JSON 'settings'
      const currentSettings =
        typeof nightclub.settings === 'object'
          ? (nightclub.settings as any)
          : {};

      const updatedSettings = {
        ...currentSettings,
        mpAccountId: String(user_id),
        mpAccessToken: access_token,
        mpPublicKey: public_key,
        mpConnectStatus: 'CONNECTED',
        mpConnectDate: new Date().toISOString(),
      };

      // 4. PERSISTIR NO BANCO
      await this.prisma.nightclub.update({
        where: { id: nightclubId },
        data: {
          settings: updatedSettings as any,
        },
      });

      console.log(
        `✅ SUCESSO: Balada ${nightclubId} conectada ao MP. ID Conta: ${user_id}`,
      );
    } catch (error: any) {
      const errorData = error.response?.data || error.message;
      console.error('❌ Erro na troca de Token MP:', errorData);
      throw new BadRequestException(
        'Falha na autenticação com Mercado Pago. Verifique as credenciais da aplicação.',
      );
    }
  }
}
