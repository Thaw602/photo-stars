/**
 * 批量生成照片 captions
 *
 * 读取 photos-manifest.json，为每张照片生成 50-100 字的诗意中文小记。
 * 基于日期、季节、同一天的照片数量等信息生成多样化的文案。
 *
 * 用法: node scripts/generate-captions.js
 * 输出: public/captions.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, '..', 'public', 'photos-manifest.json');
const OUTPUT = join(__dirname, '..', 'public', 'captions.json');

// ---- 季节判断 ----
function getSeason(month) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

// ---- 从文件名尝试提取时间 ----
function extractHour(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  // 微信图片_YYYYMMDDHHmmss_*
  const wechatMatch = name.match(/微信图片_\d{8}(\d{2})\d{4}/);
  if (wechatMatch) return parseInt(wechatMatch[1]);
  // IMG_YYYYMMDD_HHmmss
  const imgMatch = name.match(/IMG_\d{8}_(\d{2})\d{4}/);
  if (imgMatch) return parseInt(imgMatch[1]);
  // YYYYMMDD_HHmmss_*
  const dirMatch = name.match(/^\d{8}_(\d{2})\d{4}/);
  if (dirMatch) return parseInt(dirMatch[1]);
  return null;
}

function getTimeOfDay(hour) {
  if (hour === null) return null;
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 19) return 'dusk';
  if (hour >= 19 && hour < 22) return 'evening';
  return 'night';
}

// ---- 模板库 ----
const TEMPLATES = {
  spring: {
    dawn: [
      '春日的晨曦轻轻洒落，万物苏醒的气息弥漫在空气中，这一刻的宁静如同初生的希望。',
      '春天的清晨带着微凉的风，花瓣上的露珠闪烁着晶莹，新的一天在温柔中开启。',
    ],
    morning: [
      '春光明媚的上午，阳光穿过嫩绿的枝叶洒下斑驳光影，一切都充满了生机与活力。',
      '春日早晨的阳光温暖而不炙热，微风拂面，仿佛所有的美好都在这一刻绽放。',
    ],
    noon: [
      '春天的正午，阳光正好，温度宜人，在这一刻按下快门，留住了春日最温柔的时光。',
      '午间春阳透过云层洒落，大地回暖，万物复苏，每一帧都是生命蓬勃的见证。',
    ],
    afternoon: [
      '春日的午后慵懒而漫长，微风带着花香拂过，时光仿佛在这一刻慢了下来。',
      '春天的下午茶时光，阳光斜照，花开正好，生活的诗意就藏在这些细碎的日常里。',
    ],
    dusk: [
      '春日黄昏，天边染上温柔的橘粉色，夕阳余晖洒满脸庞，一天的疲惫在这一刻被治愈。',
      '春之黄昏，暮色渐浓，最后一缕阳光穿过云隙，为世界镀上一层金色的温柔。',
    ],
    evening: [
      '春夜的晚风带着花香，华灯初上，街道上人来人往，城市在夜色中苏醒另一种活力。',
      '春天夜晚的空气格外清新，微凉的晚风中隐约飘来花香，是独属于春夜的浪漫。',
    ],
    night: [
      '春夜深了，城市渐渐安静下来，在万家灯火中，记录下这一刻属于自己的小确幸。',
      '深夜春寒料峭，但心中的暖意不减，镜头定格的瞬间，是时光赠予的礼物。',
    ],
    default: [
      '春日的美好藏在每一个不经意的瞬间，花开、风暖、阳光正好，这就是春天的模样。',
      '在春天里行走，每一步都踩在柔软的时光上，繁花似锦，岁月如歌。',
      '春光乍泄的刹那，我用镜头捕捉了时间缝隙里的一抹温柔。',
    ],
  },
  summer: {
    dawn: [
      '夏日清晨的第一缕阳光穿过窗帘，微凉的空气中夹杂着青草香，新的一天开始了。',
      '夏季的黎明，天空由深蓝渐变为浅金，世界在静谧中苏醒，这一刻的美好值得铭记。',
    ],
    morning: [
      '盛夏的上午阳光明媚，绿荫下的斑驳光影像跳动的音符，谱写着夏日最美的乐章。',
      '夏日早晨，阳光已经有些炽热，但在树荫下喝一杯凉茶，就是最简单的幸福。',
    ],
    noon: [
      '夏日正午，烈日当空，蝉鸣声声，在热浪翻滚的季节里，每一个清凉的角落都是天堂。',
      '盛夏午间的骄阳热烈奔放，汗水与笑容交织，这是属于夏天的独家记忆。',
    ],
    afternoon: [
      '夏天的午后最适合发呆，空调、西瓜、和窗外的蓝天白云构成了最惬意的时光。',
      '漫长夏日的午后，阳光透过树叶洒下金黄色的光斑，时光慵懒而美好。',
    ],
    dusk: [
      '夏日黄昏，天边的火烧云绚烂夺目，晚风终于带来了凉意，一天的燥热在此刻消散。',
      '夏季的傍晚最为迷人，金色的夕阳将一切都镀上了温柔的光芒，时间仿佛静止。',
    ],
    evening: [
      '夏夜的晚风是最慷慨的礼物，吹散了白日的炎热，带来了难得的清凉与惬意。',
      '夏日夜晚，夜市喧嚣，烧烤的烟火气与冰镇饮料的透心凉，是独属于夏天的快乐。',
    ],
    night: [
      '夏夜的星空格外明亮，蛙鸣虫唱奏响夜的交响曲，在繁星下许一个美好的愿望。',
      '深夜的夏天终于安静下来，偶尔传来的几声蝉鸣提醒着我们，这是生命力最旺盛的季节。',
    ],
    default: [
      '夏天的记忆总是滚烫的，阳光、汗水、冰饮和漫长的白昼，拼凑出青春最热烈的模样。',
      '盛夏光年，每一帧都像滤镜里的画面，蓝天白云之下，记录下最灿烂的时光。',
      '热烈的夏天从不吝啬它的热情，阳光饱满，树影婆娑，一切都是最好的安排。',
    ],
  },
  autumn: {
    dawn: [
      '秋日清晨带着丝丝凉意，薄雾笼罩着远山，金色的阳光穿透雾霭，世界在朦胧中醒来。',
      '秋季的黎明宁静而清冷，露水打湿了草叶，天边的朝霞预示着又一个美好的秋日。',
    ],
    morning: [
      '秋高气爽的上午，阳光温和，天空湛蓝，落叶在风中旋转飘落，诗意了整个世界。',
      '秋天的早晨让人心旷神怡，微凉的空气和温暖的阳光交织在一起，舒适而惬意。',
    ],
    noon: [
      '秋日正午的阳光温柔了许多，透过金黄的银杏叶洒下金色光雨，美得令人屏息。',
      '午后的秋阳不骄不躁，照在身上暖洋洋的，这样的时光最适合漫步和记录。',
    ],
    afternoon: [
      '秋天的下午，阳光透过枯黄的叶子洒下斑驳的光影，一杯热茶一本书，岁月静好。',
      '秋日午后慵懒的风吹过，落叶在脚边沙沙作响，每一步都踩在季节的诗行里。',
    ],
    dusk: [
      '秋日黄昏，夕阳如一颗熟透的柿子挂在天边，将一切都染上了温暖的金橙色。',
      '秋天的傍晚，暮色四合，远山如黛，晚霞余晖中一切都显得格外温柔。',
    ],
    evening: [
      '秋夜微凉，街灯初上，行人裹紧外套匆匆走过，这座城市的秋天别有韵味。',
      '秋天晚上的风已经有了寒意，但有热腾腾的晚餐和温暖的陪伴，就是最好的时光。',
    ],
    night: [
      '秋夜的星空格外清透，凉意袭人但心是温暖的，在这样静谧的夜里思绪飘向远方。',
      '深秋的夜晚安静而深邃，偶尔一片落叶坠地的声音，提醒着岁月的流转。',
    ],
    default: [
      '秋天是收获的季节，金黄的色调洒满了每一个角落，记录下这温暖而深沉的时光。',
      '一叶知秋，在这金色的季节里，每一个瞬间都像是一幅精心绘制的油画。',
      '秋意渐浓，落叶铺满小径，在这样诗意的季节里，每一帧都值得珍藏。',
    ],
  },
  winter: {
    dawn: [
      '冬日清晨寒风凛冽，呼出的白气在空中飘散，但第一缕阳光总是带来温暖的希望。',
      '冬季的黎明来得晚，当阳光终于穿透厚重的云层时，整个世界都变得温柔了。',
    ],
    morning: [
      '冬日上午的阳光格外珍贵，暖暖地照在身上，驱散了寒冷，带来了满满的能量。',
      '冬天的早晨虽冷，但阳光洒满窗台的时候，一切寒冷都被治愈了。',
    ],
    noon: [
      '冬日正午是出门的好时光，阳光温暖而不刺眼，在寒风中捕捉冬日特有的清冽美感。',
      '冬天午间的阳光弥足珍贵，人们纷纷走出室内享受这短暂的温暖，街头多了几分热闹。',
    ],
    afternoon: [
      '冬天的午后阳光斜斜地洒进房间，暖洋洋的让人想打盹，这是属于冬日的慵懒时光。',
      '冬日午后的暖阳是最好的陪伴，一杯热可可，一本旧书，时光就这样缓缓流淌。',
    ],
    dusk: [
      '冬日黄昏来得特别早，天色暗得很快，但暮色中的那一抹橙红格外动人。',
      '冬天的傍晚，华灯初上，冷空气中弥漫着饭菜的香气，回家的脚步变得格外轻快。',
    ],
    evening: [
      '冬夜虽冷，但有热腾腾的火锅和朋友的陪伴，寒风再大也吹不散心中的暖意。',
      '冬季的夜晚最适合围坐在一起，吃一顿热气腾腾的晚餐，聊聊过去和未来。',
    ],
    night: [
      '冬夜里城市的霓虹灯在冷空气中格外耀眼，街头的小摊冒着热气，温暖着每一个夜归人。',
      '寒冬深夜，裹紧棉被，窗外北风呼啸，但心中却有说不出的安宁与温暖。',
    ],
    default: [
      '冬日的阳光最温柔，虽然短暂却格外珍贵，在寒冷中捕捉温暖，是最美的记录。',
      '冬天不只有寒冷，还有热气腾腾的美食、温暖的拥抱和年末的期待与憧憬。',
      '在寒冬里，每一个温暖的瞬间都格外值得珍惜，这是季节赠予的别样浪漫。',
    ],
  },
};

// ---- 特殊日期的自定义文案 ----
const SPECIAL_DATES = {
  '02-14': ['情人节的一天，空气里都弥漫着甜蜜的气息，镜头定格的瞬间满眼都是温柔。'],
  '05-01': ['五一假期的阳光格外惬意，难得的悠闲时光，用镜头记录下每一个轻松愉快的瞬间。'],
  '05-20': ['浪漫的一天，空气中弥漫着甜蜜的味道，每一帧都写满了美好与心动。'],
  '10-01': ['国庆佳节，红旗飘扬，在欢乐的节日气氛中记录下这难忘的时刻。'],
  '12-24': ['平安夜的气氛温馨而浪漫，街头的圣诞装饰闪着温暖的光芒，令人心生欢喜。'],
  '12-25': ['圣诞节的欢乐弥漫在空气中，彩灯闪烁，笑语盈盈，这一天的每分每秒都值得珍藏。'],
  '12-31': ['跨年之夜，辞旧迎新，在倒数的欢呼声中许下新年的愿望，满怀期待迎接新的开始。'],
  '01-01': ['新年的第一天，万象更新，阳光明媚，带着对未来的憧憬开启崭新的篇章。'],
};

// ---- 批量文案（同一天多张照片时使用）----
const BATCH_PREFIXES = [
  '这一天拍了很多照片，',
  '镜头不停按下的这天，',
  '相册里满满的都是这一天的记忆，',
  '记录了许多珍贵瞬间的一天，',
  '快门声响个不停的日子，',
  '留下了很多回忆的一天，',
  '',
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 伪随机 (确定性)
function pseudoRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateCaption(file, index, dateGroupSize, rand) {
  const date = file.date;
  const [year, monthStr, dayStr] = date.split('-');
  const month = parseInt(monthStr);
  const season = getSeason(month);
  const hour = extractHour(file.name);
  const timeOfDay = getTimeOfDay(hour);

  // 特殊日期
  const mmdd = `${monthStr}-${dayStr}`;
  if (SPECIAL_DATES[mmdd] && rand() < 0.5) {
    return getRandomItem(SPECIAL_DATES[mmdd]);
  }

  // 选时间段的模板
  const seasonTemplates = TEMPLATES[season];
  const timeKey = timeOfDay || 'default';
  const templates = seasonTemplates[timeKey] || seasonTemplates['default'];

  let caption = getRandomItem(templates);

  // 同一天多张照片时，部分添加批量前缀
  if (dateGroupSize >= 5 && index % 3 === 0 && rand() < 0.4) {
    const prefix = getRandomItem(BATCH_PREFIXES);
    if (prefix) {
      caption = prefix + caption.slice(0, 1).toLowerCase() + caption.slice(1);
    }
  }

  // 追加岁月感
  const yearAgo = 2026 - parseInt(year);
  if (yearAgo >= 1 && rand() < 0.25) {
    const suffixes = [
      `回望${yearAgo}年前的这一幕，时光飞逝但记忆犹新。`,
      `${yearAgo}年过去了，画面中的温暖依然清晰如昨。`,
      `那是${yearAgo}年前的事了，但每次翻到这张照片都会会心一笑。`,
    ];
    caption += getRandomItem(suffixes);
  }

  return caption;
}

// ---- 主函数 ----
function main() {
  console.log('读取 manifest...');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));

  // 按日期分组，统计每天的照片数
  const dateGroups = {};
  for (const file of manifest.files) {
    if (!dateGroups[file.date]) dateGroups[file.date] = [];
    dateGroups[file.date].push(file);
  }

  // 生成 captions
  const captions = {};
  const globalRand = pseudoRandom(137); // 固定种子保证可复现

  for (const [date, files] of Object.entries(dateGroups)) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const caption = generateCaption(file, i, files.length, globalRand);
      captions[String(file.id)] = caption;
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(captions, null, 2));
  console.log(`输出: ${OUTPUT}`);
  console.log(`共生成 ${Object.keys(captions).length} 条 caption`);

  // 打印几条样例
  const samples = Object.entries(captions).slice(0, 5);
  console.log('\n样例:');
  for (const [id, caption] of samples) {
    console.log(`  [${id}]: ${caption}`);
  }
}

main();
