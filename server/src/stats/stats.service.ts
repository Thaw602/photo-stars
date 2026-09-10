import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Photo } from '../entities/photo.entity';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Photo) private photos: Repository<Photo>,
  ) {}

  async timeDistribution() {
    return this.photos.createQueryBuilder('p')
      .select("DATE_FORMAT(p.taken_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('p.deleted_at IS NULL')
      .groupBy('month').orderBy('month', 'ASC').getRawMany();
  }

  async seasonalDistribution() {
    return this.photos.createQueryBuilder('p')
      .select(
        "CASE WHEN MONTH(p.taken_date) BETWEEN 3 AND 5 THEN '春' WHEN MONTH(p.taken_date) BETWEEN 6 AND 8 THEN '夏' WHEN MONTH(p.taken_date) BETWEEN 9 AND 11 THEN '秋' ELSE '冬' END",
        'season',
      )
      .addSelect('COUNT(*)', 'count')
      .where('p.deleted_at IS NULL')
      .groupBy('season').getRawMany();
  }

  async mediaRatio() {
    return this.photos.createQueryBuilder('p')
      .select('p.media_type', 'media_type')
      .addSelect('COUNT(*)', 'count')
      .where('p.deleted_at IS NULL')
      .groupBy('p.media_type').getRawMany();
  }
}
