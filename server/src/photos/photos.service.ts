import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Like, Repository } from 'typeorm';
import { Photo } from '../entities/photo.entity';
import { QueryPhotoDto } from './dto/query-photo.dto';

@Injectable()
export class PhotosService {
  constructor(@InjectRepository(Photo) private photos: Repository<Photo>) {}

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
}
