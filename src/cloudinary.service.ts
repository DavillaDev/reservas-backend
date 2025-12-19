import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    // LOG DE DEBUG: Vai aparecer no painel do Render.
    // Se aparecer "undefined", sabemos que o Render não injetou a variável.
    console.log('🔧 Inicializando Cloudinary com:', {
      cloud_name: cloudName,
      api_key: apiKey ? 'DEFINIDO (OK)' : 'INDEFINIDO (ERRO)',
      api_secret: apiSecret ? 'DEFINIDO (OK)' : 'INDEFINIDO (ERRO)',
    });

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo inválido: Buffer vazio.');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nightclub_uploads',
        },
        (error, result) => {
          if (error) {
            console.error('❌ Erro Cloudinary:', error);
            return reject(
              new InternalServerErrorException(
                `Cloudinary Error: ${error.message}`,
              ),
            );
          }
          if (!result) {
            return reject(
              new Error(
                'Erro desconhecido: Cloudinary não retornou resultado.',
              ),
            );
          }

          resolve(result.secure_url);
        },
      );

      // Usando streamifier (mais estável para NestJS)
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
