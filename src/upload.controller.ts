import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service'; // 🛡️ Importando seu novo serviço

@Controller('upload')
export class UploadController {
  // Injetamos o serviço no construtor
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post()
  @UseInterceptors(
    // 🛡️ Removemos o 'storage: diskStorage'.
    // Por padrão, o Nest guarda o arquivo no 'buffer' (memória RAM)
    FileInterceptor('file'),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    try {
      // 🛡️ Enviamos o buffer para o Cloudinary e aguardamos a URL permanente
      const imageUrl = await this.cloudinaryService.uploadImage(file);

      // ✅ Retornamos a URL definitiva do Cloudinary (https://res.cloudinary.com/...)
      return {
        url: imageUrl,
      };
    } catch (error) {
      console.error('Erro no upload Cloudinary:', error);
      throw new BadRequestException(
        'Falha ao subir imagem para o servidor de nuvem.',
      );
    }
  }
}
