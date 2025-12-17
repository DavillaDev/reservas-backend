import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
const toStream = require('buffer-to-stream');

@Injectable()
export class CloudinaryService {
  constructor() {
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    // 🛡️ Usando as variáveis que você definiu no Render
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: 'nightclub_uploads', // Organiza suas fotos em uma pasta na nuvem
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result)
            return reject(new Error('Erro ao obter resposta do Cloudinary'));

          resolve(result.secure_url); // Retorna o link permanente https://...
        },
      );

      // Converte o arquivo da memória (RAM) para o fluxo de upload
      toStream(file.buffer).pipe(upload);
    });
  }
}
