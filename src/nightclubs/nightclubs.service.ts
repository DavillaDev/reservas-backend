import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { classToPlain } from 'class-transformer';
import { UpdateNightclubDto } from './dto/update-nightclub.dto';
import { CreateNightclubDto } from './dto/create-nightclub.dto';
import { encrypt, decrypt } from '../common/utils/encryption.util';

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

  // ===========================================================================
  // 1. CRIAR BALADA (SaaS Onboarding)
  // ===========================================================================
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
        plan: 'FREE',
      },
    });
  }

  // ===========================================================================
  // 2. LISTAR TODAS (Visão Super Admin)
  // ===========================================================================
  findAll() {
    return this.prisma.nightclub.findMany({
      include: {
        spaces: true,
        users: { select: { id: true } },
      },
    });
  }

  // ===========================================================================
  // 3. BUSCAR POR ID (Utilizado no Dashboard e Paywall)
  // ===========================================================================
  async findOne(id: string) {
    const nightclub = await this.prisma.nightclub.findUnique({
      where: { id },
      include: {
        spaces: { orderBy: { name: 'asc' } },
        aiAgent: true,
        whatsappInstances: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!nightclub) throw new NotFoundException('Balada não encontrada.');
    return nightclub;
  }

  // ===========================================================================
  // 4. BUSCAR POR SLUG (Página Pública de Reservas)
  // ===========================================================================
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

  // ===========================================================================
  // 5. ATUALIZAR (Dashboard do Cliente)
  // ===========================================================================
  async update(id: string, updateNightclubDto: UpdateNightclubDto) {
    const { settings, ...restOfData } = updateNightclubDto;
    const dataToUpdate: any = { ...restOfData };

    if (settings) {
      dataToUpdate.settings = classToPlain(settings);
    }

    return this.prisma.nightclub.update({
      where: { id },
      data: dataToUpdate,
      include: { spaces: true },
    });
  }

  // ===========================================================================
  // 6. DELETAR (Segurança de Transação)
  // ===========================================================================
  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.whatsappInstance.deleteMany({ where: { nightclubId: id } });
      await tx.aiAgent.deleteMany({ where: { nightclubId: id } });
      await tx.reservation.deleteMany({ where: { nightclubId: id } });
      await tx.space.deleteMany({ where: { nightclubId: id } });
      await tx.user.deleteMany({ where: { nightclubId: id } });

      return tx.nightclub.delete({ where: { id } });
    });
  }

  // ===========================================================================
  // 7. MERCADO PAGO: GERAR URL OAUTH
  // ===========================================================================
  async generateMpConnectUrl(nightclubId: string): Promise<string> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !redirectUri) {
      throw new InternalServerErrorException(
        'Configurações de OAuth do Mercado Pago incompletas.',
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state: nightclubId,
      scopes: 'read,write,offline_access,payments',
    });

    const finalUrl = `${MP_OAUTH_BASE_URL}?${params.toString()}`;
    console.log(`⚙️ [OAUTH - SERVICE] URL de destino montada: ${finalUrl}`);

    return finalUrl;
  }

  // ===========================================================================
  // 8. MERCADO PAGO: CALLBACK (TOKEN BLINDADO 🔐)
  // ===========================================================================
  async handleMpCallback(code: string, nightclubId: string): Promise<void> {
    const clientId = this.configService.get('MP_CLIENT_ID');
    const clientSecret = this.configService.get('MP_CLIENT_SECRET');
    const redirectUri = this.configService.get('MP_REDIRECT_URI_NIGHTCLUB');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        'Servidor sem credenciais MP configuradas.',
      );
    }

    console.log(
      `\n⚙️ [OAUTH - PASSO 3] Fazendo POST para o Mercado Pago trocar o code pelo access_token...`,
    );
    console.log(`   - URL Alvo: ${MP_TOKEN_URL}`);
    console.log(
      `   - Payload: { client_id: "${clientId}", grant_type: "authorization_code", redirect_uri: "${redirectUri}", code: "${code.substring(0, 5)}..." }`,
    );

    try {
      const tokenResponse = await axios.post<MpTokenResponse>(MP_TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const { access_token, user_id, public_key, refresh_token } =
        tokenResponse.data;

      console.log(
        `\n✅ [OAUTH - PASSO 4] Sucesso na requisição! O MP devolveu os dados:`,
      );
      console.log(`   - MP user_id: ${user_id}`);
      console.log(
        `   - access_token: Recebido com ${access_token?.length || 0} caracteres`,
      );
      console.log(
        `   - refresh_token: ${refresh_token ? 'Recebido' : 'NÃO Recebido'}`,
      );

      const nightclub = await this.prisma.nightclub.findUnique({
        where: { id: nightclubId },
        select: { settings: true },
      });

      if (!nightclub) throw new NotFoundException('Balada não encontrada.');

      const currentSettings =
        typeof nightclub.settings === 'object'
          ? (nightclub.settings as any)
          : {};

      console.log(
        `💾 [OAUTH - DB] Atualizando banco de dados com tokens criptografados...`,
      );

      const updatedSettings = {
        ...currentSettings,
        mpAccountId: String(user_id),
        mpAccessToken: encrypt(access_token),
        mpRefreshToken: refresh_token ? encrypt(refresh_token) : null,
        mpPublicKey: public_key,
        mpConnectStatus: 'CONNECTED',
        mpConnectDate: new Date().toISOString(),
      };

      await this.prisma.nightclub.update({
        where: { id: nightclubId },
        data: { settings: updatedSettings as any },
      });

      console.log(
        `✅ [OAUTH - DB] Tokens criptografados e salvos para a balada ID: ${nightclubId}`,
      );
    } catch (error: any) {
      console.error(
        '\n❌ [OAUTH - ERRO PASSO 3] O Mercado Pago rejeitou a troca do código!',
      );
      console.error(`   - Status HTTP: ${error.response?.status}`);
      console.error(
        `   - Resposta do MP:`,
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        'Erro na conexão com Mercado Pago. Tente novamente.',
      );
    }
  }

  // ===========================================================================
  // 9. ATUALIZAR STATUS DA INSTÂNCIA WHATSAPP (SENTINELA 🛰️)
  // ===========================================================================
  async updateInstanceStatus(instanceName: string, status: string) {
    console.log(
      `[Sentinela] Atualizando status de ${instanceName} para: ${status}`,
    );

    return this.prisma.whatsappInstance.update({
      where: { instanceName },
      data: { status: status.toUpperCase() },
    });
  }
}
