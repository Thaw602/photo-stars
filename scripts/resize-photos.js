/**
 * Batch resize photos for web deployment.
 * Resizes all images to max 1200px (long edge), JPEG quality 78.
 * Skips videos (.mp4).
 * Overwrites originals — run only when you have backups!
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = path.join(__dirname, '..', 'public', 'photos');
const MAX_PX = 1200;
const JPEG_QUALITY = 78;

const files = fs.readdirSync(PHOTOS_DIR);
let totalBefore = 0;
let totalAfter = 0;
let count = 0;

for (const file of files) {
  const filePath = path.join(PHOTOS_DIR, file);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;

  const ext = path.extname(file).toLowerCase();
  if (ext === '.mp4' || ext === '.mov' || ext === '.webm') {
    console.log(`[SKIP video] ${file}`);
    continue;
  }

  totalBefore += stat.size;

  try {
    const inputBuffer = fs.readFileSync(filePath);
    const result = await sharp(inputBuffer)
      .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // If original was PNG, save as JPG to save more space
    const newName = ext === '.png' ? file.replace(/\.png$/i, '.jpg') : file;
    const newPath = path.join(PHOTOS_DIR, newName);

    fs.writeFileSync(newPath, result);
    if (newPath !== filePath) {
      fs.unlinkSync(filePath); // remove old PNG
    }

    totalAfter += result.length;
    count++;
    const pct = ((1 - result.length / stat.size) * 100).toFixed(0);
    console.log(`[OK] ${newName}  ${(stat.size/1024/1024).toFixed(1)}MB → ${(result.length/1024/1024).toFixed(1)}MB (${pct}%)`);
  } catch (err) {
    console.error(`[FAIL] ${file}: ${err.message}`);
  }
}

const beforeMB = (totalBefore / 1024 / 1024).toFixed(0);
const afterMB = (totalAfter / 1024 / 1024).toFixed(0);
console.log(`\nDone: ${count} images, ${beforeMB}MB → ${afterMB}MB`);
