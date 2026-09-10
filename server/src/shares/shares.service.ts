import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { Share } from '../entities/share.entity';
import { Photo } from '../entities/photo.entity';

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share) private shares: Repository<Share>,
    @InjectRepository(Photo) private photos: Repository<Photo>,
  ) {}

  async create(photoId: number): Promise<{ token: string }> {
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await this.shares.save(
      this.shares.create({ photo_id: photoId, token, expires_at: expires }),
    );
    return { token };
  }

  async resolve(token: string) {
    const share = await this.shares.findOne({
      where: { token, deleted_at: IsNull() },
    });
    if (!share) throw new NotFoundException();
    if (share.expires_at < new Date()) throw new GoneException();
    return this.photos.findOne({
      where: { id: share.photo_id, deleted_at: IsNull() },
    });
  }
}
