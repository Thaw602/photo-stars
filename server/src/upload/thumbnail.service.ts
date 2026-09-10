import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp = require('sharp');
import { MediaType } from '../entities/photo.entity';

const execFileAsync = promisify(execFile);

@Injectable()
export class ThumbnailService {
  async generate(filePath: string, mediaType: MediaType): Promise<string> {
    const out = filePath.replace(/\.\w+$/, '.thumb.jpg');
    if (mediaType === 'photo') {
      await sharp(filePath)
        .resize({ width: 480, height: 480, fit: 'inside' })
        .jpeg({ quality: 80 })
        .toFile(out);
    } else {
      // ffmpeg is on PATH locally (C:\ffmpeg\bin) but bundled on the demo USB,
      // so the binary must stay env-overridable.
      await execFileAsync(process.env.FFMPEG_PATH ?? 'ffmpeg', [
        '-y',
        '-i',
        filePath,
        '-vf',
        'thumbnail',
        '-frames:v',
        '1',
        out,
      ]);
    }
    return out;
  }
}
