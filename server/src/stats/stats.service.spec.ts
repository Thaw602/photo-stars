import { Repository } from 'typeorm';
import { StatsService } from './stats.service';
import { Photo } from '../entities/photo.entity';

describe('StatsService', () => {
  let service: StatsService;
  let photosRepoMock: Partial<Repository<Photo>>;
  let qb: any;

  beforeEach(() => {
    qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ month: '2024-08', count: '3' }]),
    };
    photosRepoMock = {
      createQueryBuilder: jest.fn(() => qb),
    };
    service = new StatsService(photosRepoMock as Repository<Photo>);
  });

  describe('timeDistribution', () => {
    it('returns the raw monthly rows and filters out soft-deleted photos', async () => {
      const rows = [{ month: '2024-08', count: '3' }];
      (qb.getRawMany as jest.Mock).mockResolvedValue(rows);

      const result = await service.timeDistribution();

      expect(result).toBe(rows);
      expect(photosRepoMock.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(qb.where).toHaveBeenCalledWith('p.deleted_at IS NULL');
    });
  });

  describe('seasonalDistribution', () => {
    it('returns the raw seasonal rows and filters out soft-deleted photos', async () => {
      const rows = [{ season: '春', count: '1' }];
      (qb.getRawMany as jest.Mock).mockResolvedValue(rows);

      const result = await service.seasonalDistribution();

      expect(result).toBe(rows);
      expect(photosRepoMock.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(qb.where).toHaveBeenCalledWith('p.deleted_at IS NULL');
    });
  });

  describe('mediaRatio', () => {
    it('returns the raw media-type rows and filters out soft-deleted photos', async () => {
      const rows = [{ media_type: 'photo', count: '10' }];
      (qb.getRawMany as jest.Mock).mockResolvedValue(rows);

      const result = await service.mediaRatio();

      expect(result).toBe(rows);
      expect(photosRepoMock.createQueryBuilder).toHaveBeenCalledWith('p');
      expect(qb.where).toHaveBeenCalledWith('p.deleted_at IS NULL');
    });
  });
});
