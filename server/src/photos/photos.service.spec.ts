import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsNull, Like, Repository } from 'typeorm';
import { PhotosService } from './photos.service';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';

describe('PhotosService', () => {
  let service: PhotosService;
  let photosRepoMock: Partial<Repository<Photo>>;
  let captionsRepoMock: Partial<Repository<Caption>>;
  let sharesRepoMock: Partial<Repository<Share>>;

  beforeEach(() => {
    photosRepoMock = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };
    captionsRepoMock = { update: jest.fn() };
    sharesRepoMock = { update: jest.fn() };
    service = new PhotosService(
      photosRepoMock as Repository<Photo>,
      captionsRepoMock as Repository<Caption>,
      sharesRepoMock as Repository<Share>,
    );
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

  describe('softDelete', () => {
    it('soft-deletes own uploaded photo and cascades to captions/shares', async () => {
      const photo = { id: 1, user_id: 42, is_builtin: false, deleted_at: null } as Photo;
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue(photo);
      (photosRepoMock.save as jest.Mock).mockImplementation(async (p) => p);

      await service.softDelete(1, 42);

      expect(photo.deleted_at).toBeInstanceOf(Date);
      expect(photosRepoMock.save).toHaveBeenCalledWith(photo);
      expect(captionsRepoMock.update).toHaveBeenCalledWith(
        { photo_id: 1, deleted_at: IsNull() },
        { deleted_at: photo.deleted_at },
      );
      expect(sharesRepoMock.update).toHaveBeenCalledWith(
        { photo_id: 1, deleted_at: IsNull() },
        { deleted_at: photo.deleted_at },
      );
    });

    it('throws ForbiddenException for builtin photos', async () => {
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: null,
        is_builtin: true,
      } as Photo);

      await expect(service.softDelete(1, 42)).rejects.toBeInstanceOf(ForbiddenException);
      expect(photosRepoMock.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for another user\'s photo', async () => {
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: 7,
        is_builtin: false,
      } as Photo);

      await expect(service.softDelete(1, 42)).rejects.toBeInstanceOf(ForbiddenException);
      expect(photosRepoMock.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when photo does not exist', async () => {
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.softDelete(999, 42)).rejects.toBeInstanceOf(NotFoundException);
      expect(photosRepoMock.save).not.toHaveBeenCalled();
    });
  });
});
