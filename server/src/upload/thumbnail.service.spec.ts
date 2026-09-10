import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import sharp = require('sharp');
import { ThumbnailService } from './thumbnail.service';

const execFileAsync = promisify(execFile);

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

// ffmpeg is on PATH locally (C:\ffmpeg\bin) but will be bundled for the demo USB,
// so it must stay env-overridable. Probe synchronously so the video test can be
// registered as `it.skip` (a clean skip) rather than failing when ffmpeg is absent.
const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffmpegPresent = (() => {
  try {
    return spawnSync(ffmpegBin, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

if (!ffmpegPresent) {
  // eslint-disable-next-line no-console
  console.warn(
    `[thumbnail.service.spec] ffmpeg binary "${ffmpegBin}" not found on PATH — ` +
      'the video thumbnail test will be skipped.',
  );
}

describe('ThumbnailService', () => {
  let service: ThumbnailService;
  let dir: string;

  beforeEach(async () => {
    service = new ThumbnailService();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('produces a .thumb.jpg for an image with long edge ≤ 480px', async () => {
    const input = path.join(dir, 'photo.png');
    await fs.writeFile(input, PNG_1x1);

    const out = await service.generate(input, 'photo');

    expect(out).toBe(path.join(dir, 'photo.thumb.jpg'));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(480);
    expect((await fs.stat(out)).size).toBeGreaterThan(0);
  });

  it('caps a large image at a 480px long edge', async () => {
    const input = path.join(dir, 'wide.png');
    await sharp({
      create: { width: 1000, height: 600, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toFile(input);

    const out = await service.generate(input, 'photo');

    const meta = await sharp(out).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(480);
  });

  (ffmpegPresent ? it : it.skip)('grabs the first frame of a video as a .thumb.jpg', async () => {
    const input = path.join(dir, 'clip.mp4');
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x240:rate=10',
      '-c:v',
      'mpeg4',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);

    const out = await service.generate(input, 'video');

    expect(out).toBe(path.join(dir, 'clip.thumb.jpg'));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
  });
});
