import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Like, Repository } from 'typeorm';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';
import { QueryPhotoDto } from './dto/query-photo.dto';

@Injectable()
export class PhotosService {
  constructor(
    @InjectRepository(Photo) private photos: Repository<Photo>,
    @InjectRepository(Caption) private captions: Repository<Caption>,
    @InjectRepository(Share) private shares: Repository<Share>,
  ) {}

  async findAll({ page = 1, pageSize = 60, mediaType }: QueryPhotoDto) {
    const where: FindOptionsWhere<Photo> = { deleted_at: IsNull() };
    if (mediaType) where.media_type = mediaType;
    const [items, total] = await this.photos.findAndCount({
      where,
      order: { sort_order: 'ASC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { total, items };
  }

  detail(id: number) {
    return this.photos.findOne({ where: { id, deleted_at: IsNull() } });
  }

  search(q: string) {
    return this.photos.find({
      where: { deleted_at: IsNull(), file_path: Like(`%${q}%`) },
      take: 100,
    });
  }

  async softDelete(id: number, userId: number) {
    const photo = await this.detail(id);
    if (!photo) throw new NotFoundException();
    if (photo.is_builtin || photo.user_id !== userId) throw new ForbiddenException();
    const now = new Date();
    photo.deleted_at = now;
    await this.photos.save(photo);
    await this.captions.update({ photo_id: id, deleted_at: IsNull() }, { deleted_at: now });
    await this.shares.update({ photo_id: id, deleted_at: IsNull() }, { deleted_at: now });
  }
}
