import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', // Salva na pasta uploads na raiz da API
        filename: (req, file, cb) => {
          // Gera um nome único: random + extensão original
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    // 🚨 CORREÇÃO AQUI:
    // Pega a URL definida no Render (API_BASE_URL) ou usa localhost se estiver no PC
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

    // Retorna a URL correta (Ex: https://sua-api.onrender.com/uploads/xyz.jpg)
    return {
      url: `${baseUrl}/uploads/${file.filename}`,
    };
  }
}
