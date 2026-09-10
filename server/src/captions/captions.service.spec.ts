import { IsNull, Repository } from 'typeorm';
import { CaptionsService } from './captions.service';
import { Caption } from '../entities/caption.entity';

describe('CaptionsService', () => {
  let service: CaptionsService;
  let captionsRepoMock: Partial<Repository<Caption>>;

  beforeEach(() => {
    captionsRepoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    service = new CaptionsService(captionsRepoMock as Repository<Caption>);
  });

  describe('getByPhoto', () => {
    it('returns the caption when present', async () => {
      const caption = { id: 1, photo_id: 10, text: 'hello', deleted_at: null } as Caption;
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(caption);

      const result = await service.getByPhoto(10);

      expect(result).toBe(caption);
      expect(captionsRepoMock.findOne).toHaveBeenCalledWith({
        where: { photo_id: 10, deleted_at: IsNull() },
      });
    });

    it('returns null when absent', async () => {
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getByPhoto(999);

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates when absent', async () => {
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(null);
      (captionsRepoMock.create as jest.Mock).mockReturnValue({ photo_id: 10, text: 'new' });
      (captionsRepoMock.save as jest.Mock).mockResolvedValue({ id: 1, photo_id: 10, text: 'new' });

      await service.upsert(10, 'new');

      expect(captionsRepoMock.create).toHaveBeenCalledWith({ photo_id: 10, text: 'new' });
      expect(captionsRepoMock.save).toHaveBeenCalled();
    });

    it('updates text when present', async () => {
      const caption = { id: 1, photo_id: 10, text: 'old', deleted_at: null } as Caption;
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(caption);
      (captionsRepoMock.save as jest.Mock).mockImplementation(async (c) => c);

      await service.upsert(10, 'updated');

      expect(caption.text).toBe('updated');
      expect(captionsRepoMock.save).toHaveBeenCalledWith(caption);
      expect(captionsRepoMock.create).not.toHaveBeenCalled();
    });

    it('restores a soft-deleted caption (clears deleted_at)', async () => {
      const caption = { id: 1, photo_id: 10, text: 'old', deleted_at: new Date() } as Caption;
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(caption);
      (captionsRepoMock.save as jest.Mock).mockImplementation(async (c) => c);

      await service.upsert(10, 'restored');

      expect(caption.text).toBe('restored');
      expect(caption.deleted_at).toBeNull();
      expect(captionsRepoMock.save).toHaveBeenCalledWith(caption);
    });

    it('looks up by photo_id WITHOUT filtering deleted_at (R15)', async () => {
      (captionsRepoMock.findOne as jest.Mock).mockResolvedValue(null);

      await service.upsert(10, 'x');

      expect(captionsRepoMock.findOne).toHaveBeenCalledWith({ where: { photo_id: 10 } });
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the active caption', async () => {
      (captionsRepoMock.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.softDelete(10);

      expect(captionsRepoMock.update).toHaveBeenCalledWith(
        { photo_id: 10, deleted_at: IsNull() },
        { deleted_at: expect.any(Date) },
      );
    });
  });
});
