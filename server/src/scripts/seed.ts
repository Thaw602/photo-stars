import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { AppModule } from '../app.module';
import { Photo } from '../entities/photo.entity';
import { Caption } from '../entities/caption.entity';

interface ManifestFile {
  id: number;
  name: string;
  date: string;
  type: 'photo' | 'video';
  size: number;
  path: string;
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const photos = app.get<Repository<Photo>>(getRepositoryToken(Photo));
  const captions = app.get<Repository<Caption>>(getRepositoryToken(Caption));

  const existing = await photos.count({ where: { is_builtin: true } });
  if (existing > 0) {
    console.log(`Already seeded (${existing} builtin photos); skipping.`);
    await app.close();
    return;
  }

  const publicDir = path.resolve(__dirname, '../../../public'); // server/src/scripts -> repo root/public
  const manifest = JSON.parse(readFileSync(path.join(publicDir, 'photos-manifest.json'), 'utf8'));
  const captionsJson = JSON.parse(readFileSync(path.join(publicDir, 'captions.json'), 'utf8'));

  const files: ManifestFile[] = manifest.files;
  const idMap = new Map<number, number>(); // manifest id -> DB photos.id

  for (const f of files) {
    const saved = await photos.save(
      photos.create({
        user_id: null,
        media_type: f.type,
        file_path: f.path,
        thumbnail_path: null,
        file_size: f.size,
        taken_date: f.date,
        sort_order: f.id,
        is_builtin: true,
      }),
    );
    idMap.set(f.id, saved.id);
  }

  let captionCount = 0;
  for (const [key, text] of Object.entries(captionsJson)) {
    const dbId = idMap.get(parseInt(key, 10));
    if (dbId == null) continue;
    await captions.save(captions.create({ photo_id: dbId, text: text as string }));
    captionCount++;
  }

  const photoTotal = await photos.count();
  const captionTotal = await captions.count();
  console.log(`Seeded: ${files.length} files, ${captionCount} captions.`);
  console.log(`DB now: photos=${photoTotal}, captions=${captionTotal}.`);
  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
