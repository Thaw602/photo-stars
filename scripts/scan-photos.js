/**
 * 扫描 public/photos/ 目录，提取日期生成 manifest JSON。
 *
 * 用法: node scripts/scan-photos.js
 * 输出: public/photos-manifest.json
 */

import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = join(__dirname, '..', 'public', 'photos');
const OUTPUT = join(__dirname, '..', 'public', 'photos-manifest.json');

// 微信图片格式: 微信图片_YYYYMMDDHHmmss_xxx_xxx.jpg
const WECHAT_RE = /^微信图片_(\d{4})(\d{2})(\d{2})\d{6}/;

// IMG_YYYYMMDD_HHmmss(_xxx).jpg
const IMG_RE = /^IMG_(\d{4})(\d{2})(\d{2})_\d{6}/;

// YYYYMMDD_HHmmss_xxx.jpg 或 YYYYMMDD_HHmmss.jpg
const DIRECT_DATE_RE = /^(\d{4})(\d{2})(\d{2})_\d{6}/;

// 抖音长按保存: DOUYIN_LP_ 前缀
const DOUYIN_RE = /^DOUYIN/;

// 纯数字文件名 (可能是微信/QQ导出的)
const PURE_NUMERIC_RE = /^\d+$/;

// IMG_YYYYMMDD_* (无时间, 只有日期)
const IMG_DATE_ONLY_RE = /^IMG_(\d{4})(\d{2})(\d{2})/;

// 一些相机命名: DSC_, PXL_, MVIMG_ 等, 用文件时间
const CAMERA_PREFIXES = ['DSC_', 'PXL_', 'MVIMG_', 'PANO_', 'VID_', 'Screenshot_', 'IMG-'];

function extractDate(filename) {
  const name = filename.replace(/\.[^.]+$/, ''); // 去掉扩展名

  // 1. 微信图片
  const wechatMatch = name.match(WECHAT_RE);
  if (wechatMatch) {
    return `${wechatMatch[1]}-${wechatMatch[2]}-${wechatMatch[3]}`;
  }

  // 2. IMG_YYYYMMDD_HHmmss
  const imgMatch = name.match(IMG_RE);
  if (imgMatch) {
    return `${imgMatch[1]}-${imgMatch[2]}-${imgMatch[3]}`;
  }

  // 3. IMG_YYYYMMDD (无时间)
  const imgDateMatch = name.match(IMG_DATE_ONLY_RE);
  if (imgDateMatch) {
    return `${imgDateMatch[1]}-${imgDateMatch[2]}-${imgDateMatch[3]}`;
  }

  // 4. YYYYMMDD_HHmmss_xxx
  const directMatch = name.match(DIRECT_DATE_RE);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  // 5. DOUYIN 和纯数字和相机前缀 — 返回 null, 后续用文件时间
  if (DOUYIN_RE.test(name) || PURE_NUMERIC_RE.test(name)) {
    return null;
  }
  for (const prefix of CAMERA_PREFIXES) {
    if (name.startsWith(prefix)) return null;
  }

  return null;
}

function main() {
  console.log('扫描照片目录...');
  const entries = readdirSync(PHOTOS_DIR);
  const files = [];

  for (const name of entries) {
    // 跳过非文件
    if (name.startsWith('.')) continue;

    const ext = name.split('.').pop().toLowerCase();
    const fullPath = join(PHOTOS_DIR, name);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      console.warn(`跳过无法读取的文件: ${name}`);
      continue;
    }

    if (!stat.isFile()) continue;

    const size = stat.size;

    let date = extractDate(name);
    // 如果文件名没有日期，用文件修改时间
    if (!date) {
      const mtime = stat.mtime;
      date = `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}-${String(mtime.getDate()).padStart(2, '0')}`;
    }

    const type = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) ? 'photo'
      : ['mp4', 'mov', 'avi', 'mkv'].includes(ext) ? 'video'
      : 'other';

    files.push({
      id: files.length,
      name,
      date,
      type,
      size,
      path: `photos/${name}`,
    });
  }

  // 按日期排序
  files.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  // 重新编号
  files.forEach((f, i) => (f.id = i));

  const manifest = {
    total: files.length,
    photoCount: files.filter((f) => f.type === 'photo').length,
    videoCount: files.filter((f) => f.type === 'video').length,
    dateRange: {
      earliest: files[0]?.date ?? '',
      latest: files[files.length - 1]?.date ?? '',
    },
    files,
  };

  writeFileSync(OUTPUT, JSON.stringify(manifest));
  console.log(`输出: ${OUTPUT}`);
  console.log(`共 ${manifest.total} 个文件 (${manifest.photoCount} 照片 + ${manifest.videoCount} 视频)`);
  console.log(`日期范围: ${manifest.dateRange.earliest} ~ ${manifest.dateRange.latest}`);

  // 按日期统计
  const dateCounts = {};
  for (const f of files) {
    dateCounts[f.date] = (dateCounts[f.date] || 0) + 1;
  }
  console.log('\n按日期统计:');
  for (const [date, count] of Object.entries(dateCounts)) {
    console.log(`  ${date}: ${count} 张`);
  }
}

main();
