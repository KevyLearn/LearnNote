// CLIP BPE 分詞器（與 OpenAI CLIP / Stable Diffusion 2.x 相同的詞表）。
// 詞表檔 assets/clip-merges.txt 來自 OpenAI CLIP（MIT 授權），隨網站一起快取，離線可用。

const SOT = 49406;
const EOT = 49407;
const PAD = 0; // SD 2.x 的 pad token 是 "!"（id 0）
export const CONTEXT_LENGTH = 77;

function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  // 保持與 Python dict 相同的插入順序（決定詞表 id）
  return bs.map((b, i) => [b, String.fromCharCode(cs[i])]);
}

const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function htmlUnescape(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return HTML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** 近似 ftfy.fix_text + html.unescape + 空白整理 + 小寫。 */
export function cleanText(text) {
  let t = text.normalize('NFC');
  t = t.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
  t = t.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"');
  t = htmlUnescape(htmlUnescape(t));
  return t.split(/\s+/).filter(Boolean).join(' ').trim().toLowerCase();
}

const PATTERN = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu;

export class ClipTokenizer {
  constructor(mergesText) {
    const lines = mergesText.split('\n').filter((l) => l.length > 0);
    const merges = lines.slice(0, 49152 - 256 - 2).map((l) => l.split(' '));
    const pairs = bytesToUnicode();
    this.byteEncoder = new Map(pairs);
    const vocab = pairs.map(([, c]) => c);
    for (const [, c] of pairs) vocab.push(c + '</w>');
    for (const m of merges) vocab.push(m.join(''));
    vocab.push('<|startoftext|>', '<|endoftext|>');
    this.encoder = new Map(vocab.map((v, i) => [v, i]));
    this.ranks = new Map(merges.map((m, i) => [m[0] + ' ' + m[1], i]));
    this.cache = new Map();
    this.utf8 = new TextEncoder();
  }

  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`無法載入 CLIP 詞表（HTTP ${res.status}）`);
    return new ClipTokenizer(await res.text());
  }

  bpe(token) {
    const cached = this.cache.get(token);
    if (cached) return cached;
    const chars = Array.from(token);
    let word = chars.slice(0, -1);
    word.push(chars[chars.length - 1] + '</w>');
    while (word.length > 1) {
      let best = null;
      let bestRank = Infinity;
      for (let i = 0; i < word.length - 1; i++) {
        const r = this.ranks.get(word[i] + ' ' + word[i + 1]);
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          best = i;
        }
      }
      if (best === null) break;
      const first = word[best];
      const second = word[best + 1];
      const out = [];
      for (let i = 0; i < word.length; ) {
        if (i < word.length - 1 && word[i] === first && word[i + 1] === second) {
          out.push(first + second);
          i += 2;
        } else {
          out.push(word[i]);
          i++;
        }
      }
      word = out;
    }
    this.cache.set(token, word);
    return word;
  }

  encode(text) {
    const ids = [];
    for (const m of cleanText(text).matchAll(PATTERN)) {
      let token = '';
      for (const b of this.utf8.encode(m[0])) token += this.byteEncoder.get(b);
      for (const piece of this.bpe(token)) {
        const id = this.encoder.get(piece);
        if (id !== undefined) ids.push(id);
      }
    }
    return ids;
  }

  /** 回傳長度 77 的 token id（含開頭/結尾符號，超出部分截斷）。 */
  tokenize(text) {
    const enc = this.encode(text);
    const ids = [SOT, ...enc.slice(0, CONTEXT_LENGTH - 2), EOT];
    const out = new Array(CONTEXT_LENGTH).fill(PAD);
    ids.forEach((v, i) => (out[i] = v));
    return { ids: out, truncated: enc.length > CONTEXT_LENGTH - 2 };
  }
}
