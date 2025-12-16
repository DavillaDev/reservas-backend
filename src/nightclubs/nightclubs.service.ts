// src/nightclubs/nightclubs.service.ts (COMPLETO COM OAUTH MP CONNECT)

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

// URL de base para o Mercado Pago OAuth e Token
const MP_OAUTH_BASE_URL = 'https://auth.mercadopago.com/authorization';
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

// 🔑 Interface para tipar a resposta do Mercado Pago e resolver o erro do Axios
interface MpTokenResponse {
  access_token: string;
  user_id: number; // ID do recebedor (o mpAccountId)
  // Outros campos importantes:
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  public_key: string;
  live_mode: boolean;
}

@Injectable()
export class NightclubsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {} // 1. CRIAR

  async create(createNightclubDto: any) {
    const { name, slug, whatsapp, themeColor, logoUrl, mapUrl } =
      createNightclubDto as CreateNightclubDto;

    return this.prisma.nightclub.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        whatsapp: whatsapp || '',
        themeColor,
        logoUrl,
        mapUrl,
      },
    });
  } // 2. LISTAR TODAS (Para Dashboard Master)

  findAll() {
    return this.prisma.nightclub.findMany({
      include: {
        spaces: true,
        users: { select: { id: true } },
      },
    });
  } // 3. BUSCAR UMA POR ID (Para Dashboard Admin Local ou Master)

  findOne(id: string) {
    return this.prisma.nightclub.findUnique({
      where: { id },
      include: {
        spaces: { orderBy: { name: 'asc' } },
      },
    });
  } // 4. BUSCAR PELO SLUG (Página Pública)

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
  } // 5. ATUALIZAR (CORRIGIDO para JSON puro)

  async update(id: string, updateNightclubDto: UpdateNightclubDto) {
    const { settings, ...restOfData } = updateNightclubDto;

    const dataToUpdate: any = { ...restOfData };

    if (settings) {
      const plainSettings = classToPlain(settings);
      dataToUpdate.settings = plainSettings;
    }

    return this.prisma.nightclub.update({
      where: { id },
      data: dataToUpdate,
      include: { spaces: true },
    });
  } // 6. DELETAR (Transação em Cascata)

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reservation.deleteMany({
        where: { nightclubId: id },
      });

      await tx.space.deleteMany({
        where: { nightclubId: id },
      });

      await tx.user.deleteMany({
        where: { nightclubId: id },
      });

      const nightclub = await tx.nightclub.delete({
        where: { id },
      });

      return nightclub;
    });
  }

  // ===========================================================================
  // 7. GERAR URL DE CONEXÃO OAUTH (MP Connect)
  // ===========================================================================
  async generateMpConnectUrl(nightclubId: string): Promise<string> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !redirectUri) {
      throw new InternalServerErrorException(
        'Configurações de Cliente ID e/ou Redirect URI do Mercado Pago ausentes.',
      );
    }

    const state = nightclubId;

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state: state,
    });

    return `${MP_OAUTH_BASE_URL}?${params.toString()}`;
  }

  // ===========================================================================
  // 8. LIDAR COM O CALLBACK OAUTH E SALVAR TOKEN
  // ===========================================================================
  async handleMpCallback(code: string, nightclubId: string): Promise<void> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const clientSecret = this.configService.get('MP_CLIENT_SECRET');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        'Credenciais do Mercado Pago (ID/Secret) e/ou Redirect URI ausentes.',
      );
    }

    // 1. TROCAR O CÓDIGO DE AUTORIZAÇÃO POR UM TOKEN DE ACESSO
    try {
      // 🔑 Tipagem explícita para o Axios
      const tokenResponse = await axios.post<MpTokenResponse>(MP_TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const { access_token: mpAccessToken, user_id: mpAccountId } =
        tokenResponse.data;

      if (!mpAccessToken || !mpAccountId) {
        throw new Error('Mercado Pago não retornou access_token e/ou user_id.');
      }

      // 2. BUSCAR CONFIGURAÇÕES ATUAIS DA BALADA
      const nightclub = await this.prisma.nightclub.findUnique({
        where: { id: nightclubId },
        select: { settings: true },
      });

      if (!nightclub) {
        throw new NotFoundException(
          'Balada não encontrada para salvar o token.',
        );
      }

      const currentSettings = (nightclub.settings || {}) as any;

      // 3. ATUALIZAR E SALVAR O TOKEN E ID DA CONTA MP NO CAMPO JSON 'settings'
      const newSettings = {
        ...currentSettings,
        mpAccountId: mpAccountId.toString(), // ID do Recebedor para o Split
        mpAccessToken: mpAccessToken, // Token para futuras operações do cliente
        mpConnectStatus: 'CONNECTED',
        mpConnectDate: new Date().toISOString(),
      };

      const plainNewSettings = classToPlain(newSettings);

      await this.prisma.nightclub.update({
        where: { id: nightclubId },
        data: {
          settings: plainNewSettings,
        },
      });

      console.log(
        `✅ OAuth SUCESSO: Balada ${nightclubId} conectada. ID MP: ${mpAccountId}`,
      );
    } catch (error: any) {
      console.error(
        'Erro ao trocar código MP por token:',
        error.response?.data || error.message,
      );
      throw new BadRequestException('Falha na autenticação do Mercado Pago.');
    }
  }
}
