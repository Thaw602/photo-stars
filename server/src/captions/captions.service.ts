import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Caption } from '../entities/caption.entity';

@Injectable()
export class CaptionsService {
  constructor(
    @InjectRepository(Caption) private captions: Repository<Caption>,
  ) {}

  getByPhoto(photoId: number) {
    return this.captions.findOne({
      where: { photo_id: photoId, deleted_at: IsNull() },
    });
  }

  async upsert(photoId: number, text: string) {
    // photo_id is UNIQUE; a soft-deleted row still occupies the key. Look up
    // including soft-deleted rows so we restore rather than collide (R15).
    const caption = await this.captions.findOne({ where: { photo_id: photoId } });
    if (caption) {
      caption.text = text;
      caption.deleted_at = null;
      return this.captions.save(caption);
    }
    return this.captions.save(this.captions.create({ photo_id: photoId, text }));
  }

  async softDelete(photoId: number) {
    await this.captions.update(
      { photo_id: photoId, deleted_at: IsNull() },
      { deleted_at: new Date() },
    );
  }
}
