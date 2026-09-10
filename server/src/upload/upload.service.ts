import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Photo } from '../entities/photo.entity';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

@Injectable()
export class UploadService {
  constructor(@InjectRepository(Photo) private photos: Repository<Photo>) {}

  async upload(file: Express.Multer.File, user: { id: number }): Promise<Photo> {
    const { fileTypeFromBuffer } = await import('file-type');
    const type = await fileTypeFromBuffer(file.buffer);
    const ext = type?.ext ?? path.extname(file.originalname).slice(1);
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'mp4'];
    if (!type || !allowed.includes(ext)) throw new BadRequestException('unsupported type');
    const isVideo = ext === 'mp4';
    const limit = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > limit) throw new BadRequestException('file too large');
    const name = randomUUID() + '.' + ext;
    const dir = path.join(UPLOAD_ROOT, new Date().toISOString().slice(0, 7));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), file.buffer);
    return this.photos.save(
      this.photos.create({
        user_id: user.id,
        media_type: isVideo ? 'video' : 'photo',
        file_path: path.join(new Date().toISOString().slice(0, 7), name),
        file_size: file.size,
        taken_date: new Date().toISOString().slice(0, 10),
        is_builtin: false,
      }),
    );
  }
}
