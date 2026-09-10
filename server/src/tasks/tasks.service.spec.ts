import { Repository } from 'typeorm';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { TasksService } from './tasks.service';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';
import { Share } from '../entities/share.entity';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn(async () => undefined),
}));

const mockUnlink = fs.unlink as unknown as jest.Mock;

describe('TasksService', () => {
  let service: TasksService;
  let photosRepoMock: { find: jest.Mock; remove: jest.Mock };
  let captionsRepoMock: { delete: jest.Mock };
  let sharesRepoMock: { delete: jest.Mock };

  beforeEach(() => {
    photosRepoMock = {
      find: jest.fn(async () => []),
      remove: jest.fn(async () => undefined),
    };
    captionsRepoMock = { delete: jest.fn(async () => undefined) };
    sharesRepoMock = { delete: jest.fn(async () => undefined) };
    service = new TasksService(
      photosRepoMock as unknown as Repository<Photo>,
      captionsRepoMock as unknown as Repository<Caption>,
      sharesRepoMock as unknown as Repository<Share>,
    );
    mockUnlink.mockClear();
  });

  describe('cleanExpiredShares', () => {
    it('deletes shares whose expires_at is before now', async () => {
      await service.cleanExpiredShares();

      expect(sharesRepoMock.delete).toHaveBeenCalledTimes(1);
      const arg = sharesRepoMock.delete.mock.calls[0][0];
      expect(arg.expires_at.value).toBeInstanceOf(Date);
    });
  });

  describe('cleanSoftDeleted', () => {
    it('deletes stale photos (with their disk files) plus stale captions and shares', async () => {
      const stalePhoto = {
        id: 1,
        file_path: '2026-01/abc.png',
        thumbnail_path: '2026-01/abc.thumb.jpg',
      } as Photo;
      photosRepoMock.find.mockResolvedValue([stalePhoto]);

      await service.cleanSoftDeleted();

      expect(photosRepoMock.find).toHaveBeenCalledTimes(1);
      const findArg = photosRepoMock.find.mock.calls[0][0];
      expect(findArg.where.deleted_at.value).toBeInstanceOf(Date);

      expect(mockUnlink).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, '2026-01/abc.png'));
      expect(mockUnlink).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, '2026-01/abc.thumb.jpg'));

      expect(photosRepoMock.remove).toHaveBeenCalledWith([stalePhoto]);

      expect(captionsRepoMock.delete).toHaveBeenCalledTimes(1);
      expect(captionsRepoMock.delete.mock.calls[0][0].deleted_at.value).toBeInstanceOf(Date);

      expect(sharesRepoMock.delete).toHaveBeenCalledTimes(1);
      expect(sharesRepoMock.delete.mock.calls[0][0].deleted_at.value).toBeInstanceOf(Date);
    });

    it('skips unlink when file_path/thumbnail_path are null', async () => {
      const stalePhoto = { id: 1, file_path: null, thumbnail_path: null } as unknown as Photo;
      photosRepoMock.find.mockResolvedValue([stalePhoto]);

      await service.cleanSoftDeleted();

      expect(mockUnlink).not.toHaveBeenCalled();
      expect(photosRepoMock.remove).toHaveBeenCalledWith([stalePhoto]);
    });

    it('does not call photos.remove when there are no stale photos', async () => {
      photosRepoMock.find.mockResolvedValue([]);

      await service.cleanSoftDeleted();

      expect(photosRepoMock.remove).not.toHaveBeenCalled();
      expect(captionsRepoMock.delete).toHaveBeenCalledTimes(1);
      expect(sharesRepoMock.delete).toHaveBeenCalledTimes(1);
    });
  });
});
