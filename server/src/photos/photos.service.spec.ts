import { PhotosService } from './photos.service';
import { IsNull, Like, Repository } from 'typeorm';
import { Photo } from '../entities/photo.entity';

describe('PhotosService', () => {
  let service: PhotosService;
  let photosRepoMock: Partial<Repository<Photo>>;

  beforeEach(() => {
    photosRepoMock = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    service = new PhotosService(photosRepoMock as Repository<Photo>);
  });

  describe('findAll', () => {
    it('excludes soft-deleted rows and paginates (skip/take)', async () => {
      (photosRepoMock.findAndCount as jest.Mock).mockResolvedValue([[{ id: 1 }], 42]);

      await service.findAll({ page: 2, pageSize: 20 });

      expect(photosRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deleted_at: IsNull() },
          skip: 20,
          take: 20,
        }),
      );
    });

    it('adds mediaType filter when provided', async () => {
      (photosRepoMock.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

      await service.findAll({ mediaType: 'video' });

      expect(photosRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deleted_at: IsNull(), media_type: 'video' },
        }),
      );
    });

    it('returns { total, items }', async () => {
      const items = [{ id: 7 }];
      (photosRepoMock.findAndCount as jest.Mock).mockResolvedValue([items, 1]);

      const result = await service.findAll({});

      expect(result).toEqual({ total: 1, items });
    });
  });

  describe('detail', () => {
    it('returns null when not found', async () => {
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.detail(999);

      expect(result).toBeNull();
      expect(photosRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: 999, deleted_at: IsNull() },
      });
    });
  });

  describe('search', () => {
    it('filters by filename with a Like clause (R2)', async () => {
      (photosRepoMock.find as jest.Mock).mockResolvedValue([]);

      await service.search('beach');

      expect(photosRepoMock.find).toHaveBeenCalledTimes(1);
      const [args] = (photosRepoMock.find as jest.Mock).mock.calls[0];
      expect(args.where.deleted_at).toEqual(IsNull());
      expect(args.where.file_path).toEqual(Like('%beach%'));
      expect(args.take).toBe(100);
    });
  });
});
