import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  constructor(private configService: ConfigService) {
    // 1. Sanitização Pesada (Remove espaços e aspas)
    const cloudName = this.configService
      .get<string>('CLOUDINARY_CLOUD_NAME')
      ?.replace(/["']/g, '')
      .trim();
    const apiKey = this.configService
      .get<string>('CLOUDINARY_API_KEY')
      ?.replace(/["']/g, '')
      .trim();
    const apiSecret = this.configService
      .get<string>('CLOUDINARY_API_SECRET')
      ?.replace(/["']/g, '')
      .trim();

    // 2. Configuração
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    // 3. Log de Conferência (Verifique se bate com o Painel)
    console.log('🔍 [CLOUDINARY CHECK]');
    console.log(`   Cloud Name: ${cloudName}`);
    console.log(`   API Key:    ${apiKey}`);
    console.log(
      `   API Secret: ${apiSecret ? apiSecret.slice(0, 5) + '...' + apiSecret.slice(-5) : 'MISSING'}`,
    );
  }

  // 4. Teste Automático ao Iniciar (Ping)
  async onModuleInit() {
    try {
      console.log('📡 Testando conexão com Cloudinary (Ping)...');
      const result = await cloudinary.api.ping();
      console.log('✅ CONEXÃO BEM SUCEDIDA! Status:', result);
    } catch (error) {
      console.error('❌ FALHA NO PING (Credenciais Inválidas):');
      console.error(error);
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo inválido ou vazio.');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nightclub_uploads',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            // Se der erro aqui, é assinatura ou permissão
            console.error('❌ Erro no Upload:', error);
            return reject(
              new InternalServerErrorException(`Cloudinary: ${error.message}`),
            );
          }
          if (!result) return reject(new Error('Sem resultado do Cloudinary'));

          resolve(result.secure_url);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
