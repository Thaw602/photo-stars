import { GoneException, NotFoundException } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { SharesService } from './shares.service';
import { Share } from '../entities/share.entity';
import { Photo } from '../entities/photo.entity';

describe('SharesService', () => {
  let service: SharesService;
  let sharesRepoMock: Partial<Repository<Share>>;
  let photosRepoMock: Partial<Repository<Photo>>;

  beforeEach(() => {
    sharesRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    photosRepoMock = {
      findOne: jest.fn(),
    };
    service = new SharesService(
      sharesRepoMock as Repository<Share>,
      photosRepoMock as Repository<Photo>,
    );
  });

  describe('create', () => {
    it('returns a 32-character token and saves a row with photo_id, token, and ~7-day expiry', async () => {
      (sharesRepoMock.create as jest.Mock).mockImplementation((row) => row);
      (sharesRepoMock.save as jest.Mock).mockImplementation(async (row) => row);

      const result = await service.create(10);

      expect(result).toEqual({ token: expect.any(String) });
      expect(result.token).toHaveLength(32);

      expect(sharesRepoMock.save).toHaveBeenCalled();
      const savedRow = (sharesRepoMock.save as jest.Mock).mock.calls[0][0];
      expect(savedRow.photo_id).toBe(10);
      expect(savedRow.token).toBe(result.token);
      expect(savedRow.token.length).toBeGreaterThan(0);

      const expires = savedRow.expires_at.getTime();
      const now = Date.now();
      expect(expires).toBeGreaterThan(now + 6 * 24 * 3600 * 1000);
      expect(expires).toBeLessThanOrEqual(now + 8 * 24 * 3600 * 1000);
    });
  });

  describe('resolve', () => {
    it('returns the photo when a share is found and not expired', async () => {
      const share = {
        id: 1,
        photo_id: 10,
        token: 'tok',
        expires_at: new Date(Date.now() + 100_000),
        deleted_at: null,
      } as Share;
      (sharesRepoMock.findOne as jest.Mock).mockResolvedValue(share);
      const photo = { id: 10 } as Photo;
      (photosRepoMock.findOne as jest.Mock).mockResolvedValue(photo);

      const result = await service.resolve('tok');

      expect(result).toBe(photo);
      expect(sharesRepoMock.findOne).toHaveBeenCalledWith({
        where: { token: 'tok', deleted_at: IsNull() },
      });
      expect(photosRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: 10, deleted_at: IsNull() },
      });
    });

    it('throws GoneException when the share is expired', async () => {
      const share = {
        id: 1,
        photo_id: 10,
        token: 'tok',
        expires_at: new Date(Date.now() - 100_000),
        deleted_at: null,
      } as Share;
      (sharesRepoMock.findOne as jest.Mock).mockResolvedValue(share);

      await expect(service.resolve('tok')).rejects.toThrow(GoneException);
    });

    it('throws NotFoundException when no share exists', async () => {
      (sharesRepoMock.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.resolve('tok')).rejects.toThrow(NotFoundException);
    });
  });
});
