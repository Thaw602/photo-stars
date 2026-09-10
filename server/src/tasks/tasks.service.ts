import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Photo) private photos: Repository<Photo>,
    @InjectRepository(Caption) private captions: Repository<Caption>,
    @InjectRepository(Share) private shares: Repository<Share>,
  ) {}

  @Cron('0 3 * * *')
  async cleanExpiredShares() {
    await this.shares.delete({ expires_at: LessThan(new Date()) });
  }

  @Cron('30 3 * * *')
  async cleanSoftDeleted() {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const stale = await this.photos.find({ where: { deleted_at: LessThan(cutoff) } });
    for (const p of stale) {
      for (const rel of [p.file_path, p.thumbnail_path]) {
        if (!rel) continue;
        await unlink(path.join(UPLOAD_ROOT, rel)).catch(() => undefined); // best-effort: ignore ENOENT
      }
    }
    if (stale.length) await this.photos.remove(stale);
    await this.captions.delete({ deleted_at: LessThan(cutoff) });
    await this.shares.delete({ deleted_at: LessThan(cutoff) });
  }
}
