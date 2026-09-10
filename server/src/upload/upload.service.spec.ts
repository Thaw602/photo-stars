import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UploadService } from './upload.service';
import { Photo } from '../entities/photo.entity';

// R11: file-type v19 is ESM-only and cannot be resolved by jest-resolve under
// CommonJS. Mock it here and drive `fileTypeFromBuffer` per-test; the real
// library's magic-byte behaviour is exercised separately at runtime (native
// `import()`), which is the path this test cannot reach.
const mockFileTypeFromBuffer = jest.fn();
jest.mock('file-type', () => ({ fileTypeFromBuffer: mockFileTypeFromBuffer }), {
  virtual: true,
});

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
}));

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const MP4_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x14]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('isom'),
]);

function makeFile(buffer: Buffer, originalname: string, size?: number): Express.Multer.File {
  return { buffer, size: size ?? buffer.length, originalname } as Express.Multer.File;
}

describe('UploadService', () => {
  let service: UploadService;
  let photosRepoMock: { create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    photosRepoMock = {
      create: jest.fn((data: any) => data),
      save: jest.fn(async (data: any) => data),
    };
    service = new UploadService(photosRepoMock as unknown as Repository<Photo>);
    mockFileTypeFromBuffer.mockReset();
  });

  it('accepts a valid PNG and persists a photo with media_type=photo', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ ext: 'png', mime: 'image/png' });
    const saved = { id: 1 };
    photosRepoMock.save.mockResolvedValue(saved);
    const file = makeFile(PNG_1x1, 'photo.png');

    const result = await service.upload(file, { id: 42 });

    expect(mockFileTypeFromBuffer).toHaveBeenCalledWith(PNG_1x1);
    expect(result).toBe(saved);
    const [created] = photosRepoMock.save.mock.calls[0];
    expect(created.user_id).toBe(42);
    expect(created.media_type).toBe('photo');
    expect(created.is_builtin).toBe(false);
    expect(created.file_size).toBe(PNG_1x1.length);
    expect(created.file_path).toMatch(/^\d{4}-\d{2}[\\/][0-9a-f-]+\.png$/);
    expect(created.taken_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats mp4 as video media_type', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ ext: 'mp4', mime: 'video/mp4' });
    photosRepoMock.save.mockResolvedValue({ id: 2 });

    await service.upload(makeFile(MP4_HEADER, 'clip.mp4'), { id: 42 });

    const [created] = photosRepoMock.save.mock.calls[0];
    expect(created.media_type).toBe('video');
    expect(created.file_path).toMatch(/\.mp4$/);
  });

  it('rejects images larger than 20MB (400 file too large)', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ ext: 'png', mime: 'image/png' });

    await expect(
      service.upload(makeFile(PNG_1x1, 'big.png', 20 * 1024 * 1024 + 1), { id: 42 }),
    ).rejects.toThrow(BadRequestException);
    expect(photosRepoMock.save).not.toHaveBeenCalled();
  });

  it('rejects videos larger than 100MB (400 file too large)', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ ext: 'mp4', mime: 'video/mp4' });

    await expect(
      service.upload(makeFile(MP4_HEADER, 'big.mp4', 100 * 1024 * 1024 + 1), { id: 42 }),
    ).rejects.toThrow(BadRequestException);
    expect(photosRepoMock.save).not.toHaveBeenCalled();
  });

  it('rejects a file whose extension is forged (text named .jpg)', async () => {
    mockFileTypeFromBuffer.mockResolvedValue(undefined);

    await expect(
      service.upload(makeFile(Buffer.from('plain text not an image'), 'fake.jpg'), { id: 42 }),
    ).rejects.toThrow(BadRequestException);
    expect(photosRepoMock.save).not.toHaveBeenCalled();
  });

  it('rejects a real but unsupported type (gif)', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ ext: 'gif', mime: 'image/gif' });

    await expect(service.upload(makeFile(Buffer.from('GIF89a'), 'anim.gif'), { id: 42 })).rejects.toThrow(
      BadRequestException,
    );
    expect(photosRepoMock.save).not.toHaveBeenCalled();
  });
});
