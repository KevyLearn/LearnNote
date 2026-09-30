// 提示詞分析：把中英文關鍵字轉成「構圖、調色盤、風格、場景參數」，
// 內建引擎用它來決定神經網路的輸入與上色方式；SD 引擎用它把中文翻成英文。
import { hashString, makeRng } from './rng.js';

export const COMPOSITIONS = {
  auto: '自動',
  abstract: '抽象流動',
  mandala: '萬花筒 / 曼陀羅',
  landscape: '山水風景',
  cosmos: '宇宙星雲',
  marble: '大理石 / 流體',
};

export const STYLES = {
  auto: '自動',
  none: '原色',
  watercolor: '水彩',
  oil: '油畫',
  neon: '霓虹',
  pixel: '像素',
  sketch: '素描',
  mono: '黑白',
  vintage: '復古',
};

const PALETTES = {
  ocean: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#e0f7ff'],
  sunset: ['#2d1b4e', '#6b2d5c', '#d1495b', '#f08a4b', '#ffd479'],
  sunrise: ['#3a4a7a', '#c779a0', '#f4a6a0', '#ffd6a5', '#fff4d6'],
  night: ['#050816', '#0f1b3d', '#1f3a68', '#4c6fa8', '#e8f0ff'],
  space: ['#02010a', '#1a0b3b', '#4b1d6e', '#b83b8f', '#ffc6e6'],
  forest: ['#0b2012', '#1e4d2b', '#3f7d3a', '#8fbf5a', '#e3f2c1'],
  snow: ['#2b3a55', '#5d7ea8', '#a9c6e8', '#dfeefc', '#ffffff'],
  desert: ['#4a2c17', '#9c5b2e', '#d9904a', '#f2c57c', '#fff0cf'],
  fire: ['#1a0000', '#6b0f0f', '#c7311b', '#ff7b1c', '#ffd23f'],
  flower: ['#4a1942', '#b0306f', '#f06ba8', '#ffb3d1', '#fff0f6'],
  aurora: ['#020b1a', '#0b3d4f', '#11a37f', '#7df9c0', '#c9b6ff'],
  autumn: ['#2e1503', '#7a2e0b', '#c4561b', '#e8a33d', '#f7dc8f'],
  spring: ['#1f4d3a', '#4f9d69', '#a8d5a2', '#f7c6d9', '#fff7e8'],
  summer: ['#004e64', '#00a5cf', '#25a18e', '#9fffcb', '#fcff6c'],
  neon: ['#0a0014', '#3d0066', '#ff00a8', '#00e5ff', '#f7ff00'],
  gold: ['#2b1d05', '#6e4a0b', '#b8860b', '#e6c35c', '#fff3c4'],
  pastel: ['#a79fd1', '#b5d8f5', '#f9c6d3', '#fde2b8', '#fffbe8'],
  mono: ['#0a0a0a', '#3a3a3a', '#7a7a7a', '#bdbdbd', '#f5f5f5'],
  vintage: ['#2b1e16', '#6b4f3a', '#a8835f', '#d9bf98', '#f3e7cf'],
  dreamy: ['#2a1b5e', '#6a4cb3', '#b28cf0', '#f5b8e6', '#fff1fb'],
  dark: ['#050505', '#1a0f1f', '#3b1d3f', '#6d2f4f', '#b04a5a'],
  sky: ['#2c5d9c', '#4f8fd6', '#8cc3f2', '#d5ecff', '#ffffff'],
  ink: ['#111418', '#2f3740', '#6b7680', '#b9c0c4', '#f1eee6'],
  jade: ['#062925', '#0f5e4f', '#2a9d8f', '#8fd3c1', '#e9f7ef'],
};

// zh：中文關鍵字（子字串比對）；en：英文關鍵字（整字比對，可加 s/es）；
// tr：翻成英文給 SD 用；其餘欄位是對畫面的影響。
const LEXICON = [
  // 構圖 / 場景
  { zh: ['夕陽', '日落', '黃昏', '晚霞'], en: ['sunset', 'dusk', 'twilight'], comp: 'landscape', pal: 'sunset', flags: { sun: 1, sunLow: 1 } },
  { zh: ['日出', '朝陽', '清晨', '黎明'], en: ['sunrise', 'dawn'], comp: 'landscape', pal: 'sunrise', flags: { sun: 1, sunLow: 1 } },
  { zh: ['雪山', '冰山'], en: ['snowy mountain'], tr: 'snowy mountains', comp: 'landscape', pal: 'snow', flags: { snow: 1 } },
  { zh: ['山水'], en: ['shan shui'], tr: 'chinese ink landscape painting', comp: 'landscape', pal: 'ink', flags: { fog: 1 } },
  { zh: ['山', '峰', '峽谷', '丘陵', '風景', '草原', '田野', '山谷'], en: ['mountain', 'landscape', 'valley', 'canyon', 'hill', 'meadow', 'field', 'scenery', 'peak'], comp: 'landscape' },
  { zh: ['大海', '海洋', '海邊', '海', '沙灘'], en: ['ocean', 'sea', 'beach', 'seaside', 'coast'], tr: 'ocean', comp: 'landscape', pal: 'ocean', flags: { water: 1 } },
  { zh: ['湖', '河', '倒影', '水面'], en: ['lake', 'river', 'reflection', 'water'], comp: 'landscape', flags: { water: 1 } },
  { zh: ['森林', '樹林', '叢林', '樹'], en: ['forest', 'tree', 'jungle', 'woods'], comp: 'landscape', pal: 'forest', flags: { forest: 1 } },
  { zh: ['沙漠', '沙丘'], en: ['desert', 'dune', 'sand'], comp: 'landscape', pal: 'desert' },
  { zh: ['極光'], en: ['aurora', 'northern lights'], comp: 'landscape', pal: 'aurora', flags: { aurora: 1, night: 1, stars: 1 } },
  { zh: ['星空', '夜空', '銀河'], en: ['starry sky', 'milky way', 'starry'], tr: 'starry night sky', pal: 'night', flags: { night: 1, stars: 1 } },
  { zh: ['宇宙', '星雲', '太空', '星系', '外太空'], en: ['space', 'cosmos', 'galaxy', 'nebula', 'universe'], comp: 'cosmos', pal: 'space', flags: { stars: 1 } },
  { zh: ['行星', '星球'], en: ['planet'], comp: 'cosmos', pal: 'space', flags: { planet: 1, stars: 1 } },
  { zh: ['星星', '繁星', '星'], en: ['star'], tr: 'stars', flags: { stars: 1 } },
  { zh: ['月亮', '滿月', '月光', '月'], en: ['moon', 'moonlight'], tr: 'moon', flags: { moon: 1, night: 1 } },
  { zh: ['太陽', '陽光'], en: ['sun', 'sunlight', 'sunny'], tr: 'sun', flags: { sun: 1 } },
  { zh: ['夜晚', '午夜', '夜'], en: ['night', 'midnight'], tr: 'night', pal: 'night', flags: { night: 1 } },
  { zh: ['雪', '冬天', '冬', '冰'], en: ['snow', 'winter', 'ice', 'frozen'], tr: 'snow', pal: 'snow', flags: { snow: 1 } },
  { zh: ['霧', '雲海', '薄霧', '煙雨'], en: ['fog', 'mist', 'misty', 'haze', 'foggy'], tr: 'misty', flags: { fog: 1 } },
  { zh: ['雲', '天空'], en: ['cloud', 'sky', 'cloudy'], tr: 'clouds', pal: 'sky', flags: { clouds: 1 } },
  { zh: ['曼陀羅', '萬花筒', '對稱', '圖騰'], en: ['mandala', 'kaleidoscope', 'symmetry', 'symmetric', 'totem'], comp: 'mandala' },
  { zh: ['雪花'], en: ['snowflake'], comp: 'mandala', pal: 'snow' },
  { zh: ['櫻花', '玫瑰', '蓮花', '花朵', '花'], en: ['flower', 'blossom', 'sakura', 'rose', 'lotus', 'floral'], tr: 'flowers', comp: 'mandala', pal: 'flower' },
  { zh: ['大理石', '岩石紋'], en: ['marble'], comp: 'marble' },
  { zh: ['流體', '液體', '液態', '墨水', '漩渦', '絲綢', '煙霧', '煙'], en: ['fluid', 'liquid', 'ink', 'swirl', 'silk', 'smoke'], tr: 'fluid swirls', comp: 'marble', mods: { warp: 0.4 } },
  { zh: ['水墨'], en: ['ink wash'], tr: 'chinese ink wash painting', pal: 'ink', style: 'watercolor' },
  { zh: ['抽象', '圖案', '紋理'], en: ['abstract', 'pattern', 'texture'], comp: 'abstract' },
  { zh: ['火焰', '熔岩', '岩漿', '火'], en: ['fire', 'flame', 'lava', 'magma'], tr: 'fire', pal: 'fire', mods: { glow: 0.4 } },
  { zh: ['翡翠', '玉'], en: ['jade', 'emerald'], pal: 'jade' },
  // 季節 / 氛圍
  { zh: ['秋天', '秋', '楓葉'], en: ['autumn', 'fall', 'maple'], tr: 'autumn', pal: 'autumn' },
  { zh: ['春天', '春'], en: ['spring'], tr: 'spring', pal: 'spring' },
  { zh: ['夏天', '夏', '熱帶'], en: ['summer', 'tropical'], tr: 'summer', pal: 'summer' },
  { zh: ['夢幻', '奇幻', '童話'], en: ['dreamy', 'fantasy', 'fairytale', 'magical'], tr: 'dreamy fantasy', pal: 'dreamy', mods: { glow: 0.5, contrast: -0.2 } },
  { zh: ['粉彩', '馬卡龍'], en: ['pastel'], pal: 'pastel', mods: { contrast: -0.3 } },
  { zh: ['暗黑', '黑暗', '哥德'], en: ['dark', 'gothic', 'moody'], tr: 'dark moody', pal: 'dark', mods: { dark: 0.3 } },
  { zh: ['明亮', '燦爛'], en: ['bright', 'sunny'], tr: 'bright', mods: { dark: -0.2 } },
  { zh: ['黃金', '金色'], en: ['gold', 'golden'], tr: 'golden', pal: 'gold' },
  { zh: ['細節', '精緻', '複雜', '華麗'], en: ['detailed', 'intricate', 'complex', 'ornate'], tr: 'intricate details', mods: { detail: 0.5 } },
  { zh: ['極簡', '簡約', '簡單'], en: ['minimal', 'minimalist', 'simple'], tr: 'minimalist', mods: { detail: -0.4, warp: -0.3 } },
  { zh: ['柔和', '溫柔', '寧靜'], en: ['soft', 'calm', 'serene', 'peaceful'], tr: 'soft serene', mods: { contrast: -0.3 } },
  { zh: ['鮮豔', '鮮明', '強烈', '繽紛'], en: ['vivid', 'vibrant', 'colorful'], tr: 'vibrant colors', mods: { sat: 0.35, contrast: 0.2 } },
  // 風格
  { zh: ['水彩'], en: ['watercolor', 'watercolour'], tr: 'watercolor painting', style: 'watercolor' },
  { zh: ['油畫'], en: ['oil painting', 'oil'], tr: 'oil painting', style: 'oil' },
  { zh: ['霓虹', '賽博', '螢光', '合成波'], en: ['neon', 'cyberpunk', 'synthwave', 'vaporwave'], tr: 'neon cyberpunk', style: 'neon', pal: 'neon' },
  { zh: ['像素', '點陣', '8位元'], en: ['pixel art', 'pixel', '8-bit', '8bit'], tr: 'pixel art', style: 'pixel' },
  { zh: ['素描', '鉛筆', '手繪'], en: ['sketch', 'pencil', 'drawing'], tr: 'pencil sketch', style: 'sketch' },
  { zh: ['黑白', '單色'], en: ['monochrome', 'black and white', 'grayscale'], tr: 'black and white', style: 'mono', pal: 'mono' },
  { zh: ['復古', '懷舊', '老照片'], en: ['vintage', 'retro', 'nostalgic', 'sepia'], tr: 'vintage', style: 'vintage', pal: 'vintage' },
  // 顏色
  { zh: ['紅色', '紅'], en: ['red', 'crimson'], tr: 'red', hue: 0 },
  { zh: ['橘色', '橙色', '橘', '橙'], en: ['orange'], tr: 'orange', hue: 28 },
  { zh: ['黃色', '黃'], en: ['yellow'], tr: 'yellow', hue: 52 },
  { zh: ['綠色', '綠'], en: ['green'], tr: 'green', hue: 125 },
  { zh: ['青色', '藍綠', '青'], en: ['cyan', 'teal', 'turquoise'], tr: 'teal', hue: 180 },
  { zh: ['藍色', '藍', '蔚藍'], en: ['blue', 'azure'], tr: 'blue', hue: 215 },
  { zh: ['紫色', '紫'], en: ['purple', 'violet', 'lavender'], tr: 'purple', hue: 275 },
  { zh: ['粉紅', '粉色', '粉'], en: ['pink', 'magenta'], tr: 'pink', hue: 330 },
  { zh: ['白色', '雪白', '白'], en: ['white'], tr: 'white', tone: 'white' },
  { zh: ['黑色', '漆黑', '黑'], en: ['black'], tr: 'black', tone: 'black' },
];

// 只給 SD 引擎翻譯用的常見詞（內建引擎畫不出具體物件，所以不影響它）。
const ZH_EN_EXTRA = {
  貓: 'cat', 小貓: 'kitten', 貓咪: 'cat', 狗: 'dog', 小狗: 'puppy', 狐狸: 'fox', 狼: 'wolf', 兔子: 'rabbit', 熊: 'bear',
  熊貓: 'panda', 老虎: 'tiger', 獅子: 'lion', 鹿: 'deer', 馬: 'horse', 鳥: 'bird', 貓頭鷹: 'owl', 鯨魚: 'whale', 魚: 'fish',
  蝴蝶: 'butterfly', 龍: 'dragon', 鳳凰: 'phoenix', 獨角獸: 'unicorn', 恐龍: 'dinosaur', 企鵝: 'penguin',
  女孩: 'girl', 少女: 'young girl', 女生: 'woman', 女人: 'woman', 男孩: 'boy', 男人: 'man', 男生: 'man', 人: 'person',
  老人: 'old man', 小孩: 'child', 公主: 'princess', 騎士: 'knight', 武士: 'samurai', 忍者: 'ninja', 巫師: 'wizard',
  太空人: 'astronaut', 機器人: 'robot', 天使: 'angel', 精靈: 'elf', 美人魚: 'mermaid',
  城堡: 'castle', 房子: 'house', 小屋: 'cottage', 城市: 'city', 街道: 'street', 街: 'street', 寺廟: 'temple', 神社: 'shrine',
  塔: 'tower', 橋: 'bridge', 村莊: 'village', 花園: 'garden', 圖書館: 'library', 咖啡廳: 'cafe', 教堂: 'church',
  汽車: 'car', 車: 'car', 火車: 'train', 飛機: 'airplane', 船: 'boat', 帆船: 'sailboat', 太空船: 'spaceship', 腳踏車: 'bicycle',
  蛋糕: 'cake', 咖啡: 'coffee', 茶: 'tea', 水果: 'fruit', 蘋果: 'apple', 草莓: 'strawberry', 拉麵: 'ramen', 壽司: 'sushi',
  書: 'book', 燈籠: 'lantern', 雨傘: 'umbrella', 蠟燭: 'candle', 劍: 'sword', 皇冠: 'crown', 鑰匙: 'key', 時鐘: 'clock',
  雨: 'rain', 下雨: 'raining', 彩虹: 'rainbow', 閃電: 'lightning', 風暴: 'storm', 瀑布: 'waterfall', 島: 'island',
  草地: 'grass', 竹林: 'bamboo forest', 竹子: 'bamboo', 葉子: 'leaves', 蘑菇: 'mushroom', 向日葵: 'sunflower', 鬱金香: 'tulip',
  可愛: 'cute', 美麗: 'beautiful', 漂亮: 'beautiful', 帥氣: 'handsome', 巨大: 'giant', 小: 'small', 大: 'big', 古老: 'ancient',
  未來: 'futuristic', 未來感: 'futuristic', 魔法: 'magic', 神秘: 'mysterious', 溫暖: 'warm', 寒冷: 'cold', 發光: 'glowing',
  寫實: 'photorealistic', 照片: 'photo', 攝影: 'photography', 動漫: 'anime', 動畫: 'animation', 插畫: 'illustration',
  漫畫: 'comic', 卡通: 'cartoon', '3D': '3d render', 電影感: 'cinematic', 電影: 'cinematic', 高畫質: 'high quality',
  高清: 'high resolution', 特寫: 'close-up', 肖像: 'portrait', 風景畫: 'landscape painting', 藝術: 'art', 概念藝術: 'concept art',
  吉卜力: 'studio ghibli style', 宮崎駿: 'studio ghibli style', 日式: 'japanese style', 中國風: 'chinese style', 台灣: 'taiwan',
  遠山: 'distant mountains', 遠方: 'distance', 遠: 'distant', 近: 'close', 在: '', 的: '', 和: 'and', 與: 'and', 跟: 'and', 一隻: '', 一個: '', 一位: '', 一座: '', 一片: '', 一朵: '', 很多: 'many',
  下: 'under', 上: 'on', 中: 'in', 裡: 'in', 前: 'in front of', 旁邊: 'beside', 坐: 'sitting', 站: 'standing', 飛: 'flying',
  跑: 'running', 睡覺: 'sleeping', 看: 'looking at', 戴: 'wearing', 穿: 'wearing', 帽子: 'hat', 眼鏡: 'glasses',
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hueToward(h, target, amount) {
  const d = ((target - h + 540) % 360) - 180;
  return h + d * amount;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EN_RE = new Map();
function enIndex(textLower, term) {
  let re = EN_RE.get(term);
  if (!re) {
    re = new RegExp(`(^|[^a-z])${escapeRe(term)}(s|es)?(?![a-z])`, 'i');
    EN_RE.set(term, re);
  }
  const m = re.exec(textLower);
  return m ? m.index + m[1].length : -1;
}

/** 找出提示詞中出現的所有關鍵字（較長的詞優先、不重疊），依出現順序排列。 */
function matchLexicon(text) {
  const lower = text.toLowerCase();
  const occ = [];
  for (const entry of LEXICON) {
    for (const z of entry.zh) {
      for (let i = text.indexOf(z); i >= 0; i = text.indexOf(z, i + 1)) occ.push({ entry, index: i, len: z.length, word: z });
    }
    for (const e of entry.en) {
      const i = enIndex(lower, e);
      if (i >= 0) occ.push({ entry, index: i, len: e.length, word: e });
    }
  }
  occ.sort((a, b) => b.len - a.len || a.index - b.index);
  const taken = [];
  const seen = new Set();
  const hits = [];
  for (const o of occ) {
    if (taken.some(([s, e]) => o.index < e && o.index + o.len > s)) continue;
    taken.push([o.index, o.index + o.len]);
    if (seen.has(o.entry)) continue;
    seen.add(o.entry);
    hits.push(o);
  }
  return hits.sort((a, b) => a.index - b.index);
}

function proceduralPalette(rng) {
  const baseHue = rng.range(0, 360);
  const scheme = rng.pick([
    [0, 20, 40, 60, 80], // 類似色
    [0, 15, 180, 195, 30], // 互補
    [0, 120, 240, 60, 180], // 三等分
    [0, -30, 30, 150, 210], // 分裂互補
  ]);
  const sat = rng.range(0.45, 0.85);
  const cols = [];
  for (let i = 0; i < 5; i++) {
    const l = 0.1 + (i / 4) * rng.range(0.72, 0.85);
    cols.push(hslToRgb([baseHue + scheme[i] + rng.range(-8, 8), sat * rng.range(0.8, 1.1), l]));
  }
  return cols;
}

/**
 * 分析提示詞。
 * @returns 內建引擎需要的全部參數（構圖、調色盤、風格、旗標、數值修正）。
 */
export function analyzePrompt(prompt, seed, overrides = {}) {
  const text = (prompt || '').trim();
  const hits = matchLexicon(text);
  const baseSeed = (hashString(text.toLowerCase()) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
  const rng = makeRng(baseSeed ^ 0x5bd1e995);

  // --- 構圖 ---
  let comp = overrides.comp && overrides.comp !== 'auto' ? overrides.comp : null;
  if (!comp) {
    const comps = hits.map((h) => h.entry.comp).filter(Boolean);
    const sceneWords = hits.some(({ entry: e }) => e.flags && ['night', 'sun', 'moon', 'snow', 'fog', 'aurora', 'water'].some((k) => e.flags[k]));
    if (comps.includes('landscape')) comp = 'landscape';
    else if (comps.length) comp = comps[0];
    else if (sceneWords) comp = 'landscape';
    else {
      const r = rng.next();
      comp = r < 0.4 ? 'abstract' : r < 0.65 ? 'marble' : r < 0.85 ? 'mandala' : 'cosmos';
    }
  }

  // --- 風格 ---
  let style = overrides.style && overrides.style !== 'auto' ? overrides.style : null;
  if (!style) style = hits.map((h) => h.entry.style).find(Boolean) || 'none';

  // --- 旗標與數值修正 ---
  const flags = {};
  const mods = { detail: 0, warp: 0, contrast: 0, sat: 0, glow: 0, dark: 0 };
  for (const { entry } of hits) {
    Object.assign(flags, entry.flags || {});
    for (const [k, v] of Object.entries(entry.mods || {})) mods[k] += v;
  }

  // --- 調色盤 ---
  const palNames = hits.map((h) => h.entry.pal).filter(Boolean);
  if (style === 'neon' && !palNames.includes('neon')) palNames.unshift('neon');
  if (style === 'mono' && !palNames.includes('mono')) palNames.unshift('mono');
  if (style === 'vintage' && !palNames.includes('vintage')) palNames.push('vintage');
  if (comp === 'cosmos' && !palNames.length) palNames.push('space');
  if (flags.night && comp === 'landscape' && !palNames.length) palNames.push('night');

  let pal;
  if (palNames.length) {
    pal = PALETTES[palNames[0]].map(hexToRgb);
    if (palNames.length > 1 && palNames[1] !== palNames[0]) {
      // 第二個調色盤只輕微影響中間色階，保留主場景的氛圍
      const second = PALETTES[palNames[1]].map(hexToRgb);
      for (const i of [1, 2, 3]) pal[i] = pal[i].map((v, c) => v * 0.75 + second[i][c] * 0.25);
    }
  } else {
    pal = proceduralPalette(rng);
  }

  let hsl = pal.map(rgbToHsl);
  const hues = hits.map((h) => h.entry.hue).filter((h) => h !== undefined);
  if (hues.length) {
    // 顏色詞：把中間三個色階往指定色相拉，並提高飽和度
    hsl = hsl.map(([h, s, l], i) => {
      if (i === 0 && hues.length < 2) return [hueToward(h, hues[0], 0.5), s, l];
      const target = hues[i % hues.length];
      return [hueToward(h, target, i === 4 ? 0.5 : 0.85), Math.max(s, 0.55), l];
    });
  }
  const tones = hits.map((h) => h.entry.tone).filter(Boolean);
  if (tones.includes('white')) hsl = hsl.map(([h, s, l]) => [h, s * 0.8, 0.35 + l * 0.65]);
  if (tones.includes('black')) hsl = hsl.map(([h, s, l], i) => [h, s, l * (i === 4 ? 0.8 : 0.45)]);
  const jitter = rng.range(-10, 10);
  hsl = hsl.map(([h, s, l]) => [h + jitter, Math.min(1, s), l]);
  pal = hsl.map(hslToRgb);
  pal.sort((a, b) => luminance(a) - luminance(b));

  // --- 構圖相關的隨機場景參數 ---
  const scene = {};
  if (comp === 'landscape' && style === 'neon') {
    // 合成波風格：地平線上的大太陽、不要雲
    flags.clouds = 0;
    if (!flags.night && !flags.moon) flags.sun = flags.sunLow = 1;
  }
  if (comp === 'landscape') {
    if (flags.water === undefined) flags.water = rng.chance(0.3) ? 1 : 0;
    if (flags.clouds === undefined) flags.clouds = rng.chance(0.5) ? 1 : 0;
    if (flags.fog === undefined) flags.fog = rng.chance(0.4) ? 1 : 0;
    if (flags.night && flags.moon === undefined && !flags.sun) flags.moon = rng.chance(0.65) ? 1 : 0;
    if (flags.night && flags.stars === undefined) flags.stars = 1;
    if (!flags.night && flags.sun === undefined) flags.sun = rng.chance(0.55) ? 1 : 0;
    if (flags.night) flags.sun = 0;
    scene.horizon = flags.water ? rng.range(0.3, 0.4) : rng.range(0.18, 0.3);
    scene.sunX = rng.range(-0.32, 0.32);
    scene.sunY = flags.sunLow ? scene.horizon + rng.range(0.3, 0.42) : rng.range(0.7, 0.85);
    scene.sunR = rng.range(0.045, 0.085) * (style === 'neon' ? 1.8 : 1);
  } else if (comp === 'cosmos') {
    flags.stars = 1;
    if (flags.planet === undefined) flags.planet = rng.chance(0.45) ? 1 : 0;
    scene.planetX = rng.range(-0.55, 0.55);
    scene.planetY = rng.range(-0.5, 0.5);
    scene.planetR = rng.range(0.2, 0.42);
  }

  const baseWarp = { abstract: 0.55, marble: 1.5, mandala: 0.3, cosmos: 0.9, landscape: 0.2 }[comp];
  const params = {
    detail: Math.max(0.3, rng.range(0.8, 1.25) + mods.detail),
    warp: Math.max(0, baseWarp * rng.range(0.7, 1.3) + mods.warp),
    contrast: Math.max(0.4, rng.range(1.1, 1.7) + mods.contrast),
    sat: Math.max(0, 1 + mods.sat),
    glow: Math.max(0, 0.5 + mods.glow),
    dark: Math.min(0.8, Math.max(-0.3, mods.dark)),
    grain: 0.03,
    vignette: 0.35,
    zoom: comp === 'abstract' || comp === 'marble' ? rng.range(0.7, 1.5) : 1,
    sym: rng.pick([5, 6, 7, 8, 10, 12]),
  };
  if (style === 'vintage') Object.assign(params, { grain: 0.09, vignette: 0.7 });
  if (style === 'mono') params.grain = 0.05;
  if (style === 'watercolor') params.sat *= 0.85;
  if (style === 'pixel') Object.assign(params, { grain: 0, vignette: 0.2 });

  return {
    prompt: text,
    seed,
    baseSeed,
    comp,
    style,
    palette: pal,
    flags,
    scene,
    params,
    keywords: hits.map((h) => h.word),
  };
}

// ---------- 中文 → 英文（給 SD 引擎） ----------
let zhDict = null;
function getZhDict() {
  if (zhDict) return zhDict;
  zhDict = new Map(Object.entries(ZH_EN_EXTRA));
  for (const entry of LEXICON) {
    const tr = entry.tr || entry.en[0];
    for (const z of entry.zh) if (!zhDict.has(z)) zhDict.set(z, tr);
  }
  return zhDict;
}

const isCJK = (ch) => /[㐀-鿿豈-﫿]/.test(ch);

/**
 * 把含中文的提示詞轉成英文關鍵字（CLIP 只懂英文）。
 * 採最長詞優先比對；查不到的中文會回報在 unknown 中。
 */
export function toEnglishPrompt(text) {
  if (!text || !/[㐀-鿿]/.test(text)) return { text: (text || '').trim(), unknown: [] };
  const dict = getZhDict();
  const parts = [];
  const unknown = [];
  let ascii = '';
  let unk = '';
  const flushAscii = () => {
    const t = ascii.replace(/[，。、！？；：「」『』（）]/g, ' ').trim();
    if (t) parts.push(t);
    ascii = '';
  };
  const flushUnk = () => {
    if (unk) unknown.push(unk);
    unk = '';
  };
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (!isCJK(ch)) {
      flushUnk();
      ascii += ch;
      i++;
      continue;
    }
    flushAscii();
    let hit = false;
    for (let len = Math.min(6, text.length - i); len >= 1; len--) {
      const s = text.substr(i, len);
      if (dict.has(s)) {
        flushUnk();
        const en = dict.get(s);
        if (en) parts.push(en);
        i += len;
        hit = true;
        break;
      }
    }
    if (!hit) {
      unk += ch;
      i++;
    }
  }
  flushUnk();
  flushAscii();
  return { text: [...new Set(parts)].join(', '), unknown };
}

export const EXAMPLES = [
  '夕陽下的海邊與遠山',
  '雪山 極光 星空',
  '粉紅色的花 曼陀羅 細節',
  '藍色大理石 金色',
  '宇宙 星雲 行星',
  '水墨山水 霧',
  '霓虹 合成波 山',
  '秋天的森林 湖',
  '像素 夜晚 月亮 山',
  '抽象 流體 紫色 夢幻',
];
