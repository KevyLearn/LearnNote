// 進階引擎：Stable Diffusion Turbo（真正的文字轉圖片），用 ONNX Runtime Web 在 WebGPU 上推論。
// 流程：CLIP 文字編碼 → UNet 一步去噪（SD-Turbo 只需 1 步）→ VAE 解碼成 512×512 影像。
import { ClipTokenizer, CONTEXT_LENGTH } from './clip-tokenizer.js';
import { MODEL_FILES, readModel } from './model-store.js';
import { makeRng } from './rng.js';

const ORT_VERSION = '1.30.0';
const ORT_FILE = 'ort.webgpu.bundle.min.mjs';
// 先找自架的 vendor 目錄（可完全離線部署），找不到再用 CDN（首次使用後由 Service Worker 快取）
const ORT_SOURCES = [
  new URL('../vendor/onnxruntime-web/', import.meta.url).href,
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
];

const SIGMA = 14.6146; // EulerDiscrete、trailing 間隔下 t=999 的 sigma
const VAE_SCALE = 0.18215;
const LATENT = [1, 4, 64, 64];
const IMAGE_SIZE = 512;

const FREE_DIMS = {
  text_encoder: { batch_size: 1 },
  unet: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: CONTEXT_LENGTH },
  vae_decoder: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 },
};

let ortPromise = null;
function loadOrt() {
  ortPromise ??= (async () => {
    let lastErr = null;
    for (const base of ORT_SOURCES) {
      try {
        if (base.startsWith(location.origin)) {
          const head = await fetch(base + ORT_FILE, { method: 'HEAD' });
          if (!head.ok) continue;
        }
        // bundle 版已內含載入程式，.wasm 會從與它相同的資料夾取得
        const ort = await import(base + ORT_FILE);
        if (!self.crossOriginIsolated) ort.env.wasm.numThreads = 1;
        return ort;
      } catch (e) {
        lastErr = e;
      }
    }
    ortPromise = null;
    throw new Error('無法載入 ONNX Runtime（第一次使用需要連網下載，之後即可離線）：' + (lastErr?.message || '找不到檔案'));
  })();
  return ortPromise;
}

// ---------- float16 轉換 ----------
const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);
function toHalf(v) {
  f32buf[0] = v;
  const x = u32buf[0];
  const sign = (x >>> 16) & 0x8000;
  const e = (x >>> 23) & 0xff;
  let m = x & 0x7fffff;
  if (e === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0);
  let exp = e - 127 + 15;
  if (exp >= 0x1f) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    m = (m | 0x800000) >>> (1 - exp);
    return sign | ((m + 0x1000) >>> 13);
  }
  m += 0x1000;
  if (m & 0x800000) {
    m = 0;
    exp++;
    if (exp >= 0x1f) return sign | 0x7c00;
  }
  return sign | (exp << 10) | (m >>> 13);
}

function fromHalf(h) {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >>> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 0x1f) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

export function f32ToF16Array(a) {
  const out = new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = toHalf(a[i]);
  return out;
}

async function readFloat(t) {
  const data = t.location && t.location !== 'cpu' ? await t.getData() : t.data;
  if (data instanceof Float32Array) return data;
  if (data instanceof Uint16Array) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = fromHalf(data[i]);
    return out;
  }
  return Float32Array.from(data);
}

function metaType(sess, name, fallback) {
  const m = sess.inputMetadata?.find?.((x) => x.name === name);
  return (m && m.isTensor && m.type) || fallback;
}

export async function checkWebGPU() {
  if (!('gpu' in navigator)) return { ok: false, reason: '此瀏覽器不支援 WebGPU（請使用新版 Chrome / Edge / Safari 26+）' };
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { ok: false, reason: '找不到可用的 WebGPU 顯示卡' };
    const info = adapter.info || {};
    return {
      ok: true,
      f16: adapter.features.has('shader-f16'),
      maxBufferMB: Math.round(adapter.limits.maxBufferSize / 2 ** 20),
      name: [info.vendor, info.architecture || info.description].filter(Boolean).join(' ') || 'WebGPU',
    };
  } catch (e) {
    return { ok: false, reason: 'WebGPU 初始化失敗：' + e.message };
  }
}

export class SdTurboEngine {
  constructor({ provider = 'webgpu' } = {}) {
    this.provider = provider;
    this.sessions = {};
    this.tokenizer = null;
  }

  async #getTokenizer() {
    this.tokenizer ??= await ClipTokenizer.load(new URL('../assets/clip-merges.txt', import.meta.url).href);
    return this.tokenizer;
  }

  async #session(key, onStatus) {
    if (this.sessions[key]) return this.sessions[key];
    const ort = await loadOrt();
    const label = MODEL_FILES.find((f) => f.key === key)?.label || key;
    onStatus?.(`從本機載入 ${label}…`);
    const bytes = await readModel(key);
    onStatus?.(`初始化 ${label}（第一次會比較久）…`);
    const sess = await ort.InferenceSession.create(bytes, {
      executionProviders: [this.provider],
      enableMemPattern: false,
      enableCpuMemArena: false,
      freeDimensionOverrides: FREE_DIMS[key],
      extra: {
        session: {
          disable_prepacking: '1',
          use_device_allocator_for_initializers: '1',
          use_ort_model_bytes_directly: '1',
          use_ort_model_bytes_for_initializers: '1',
        },
      },
    });
    this.sessions[key] = sess;
    return sess;
  }

  async #drop(key) {
    const s = this.sessions[key];
    delete this.sessions[key];
    await s?.release?.();
  }

  /** 釋放所有 GPU / 記憶體資源。 */
  async unload() {
    for (const key of Object.keys(this.sessions)) await this.#drop(key);
  }

  /**
   * 產生一張 512×512 影像。
   * @returns {{imageData: ImageData, truncated: boolean, timings: object}}
   */
  async generate({ prompt, seed, lowMemory = false, onStatus }) {
    const ort = await loadOrt();
    const timings = {};
    let t = performance.now();
    const lap = (name) => {
      const now = performance.now();
      timings[name] = Math.round(now - t);
      t = now;
    };

    const tok = await this.#getTokenizer();
    const { ids, truncated } = tok.tokenize(prompt);

    // 1) 文字編碼
    const te = await this.#session('text_encoder', onStatus);
    lap('load_text_encoder');
    const teIn = te.inputNames[0];
    const idsTensor =
      metaType(te, teIn, 'int32') === 'int64'
        ? new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, CONTEXT_LENGTH])
        : new ort.Tensor('int32', Int32Array.from(ids), [1, CONTEXT_LENGTH]);
    onStatus?.('理解提示詞（CLIP 文字編碼）…');
    const teOut = await te.run({ [teIn]: idsTensor });
    const hiddenName = te.outputNames.includes('last_hidden_state') ? 'last_hidden_state' : te.outputNames[0];
    const hidden = teOut[hiddenName];
    const hiddenF32 = await readFloat(hidden);
    for (const [name, v] of Object.entries(teOut)) if (name !== hiddenName) v.dispose?.();
    lap('text_encoder');
    if (lowMemory) await this.#drop('text_encoder');

    // 2) 初始雜訊（由種子決定，可重現）
    const n = LATENT.reduce((a, b) => a * b, 1);
    const rng = makeRng(seed >>> 0);
    const latents = new Float32Array(n);
    for (let i = 0; i < n; i++) latents[i] = rng.gauss() * SIGMA;
    const inScale = 1 / Math.sqrt(SIGMA * SIGMA + 1);
    const scaled = latents.map((v) => v * inScale);

    // 3) UNet 一步去噪
    const unet = await this.#session('unet', onStatus);
    lap('load_unet');
    const floatTensor = (type, data, dims) =>
      type === 'float16' ? new ort.Tensor('float16', f32ToF16Array(data), dims) : new ort.Tensor('float32', data, dims);
    const feed = {};
    for (const name of unet.inputNames) {
      if (/timestep/i.test(name)) {
        const type = metaType(unet, name, 'int64');
        feed[name] =
          type === 'int64'
            ? new ort.Tensor('int64', BigInt64Array.from([999n]), [1])
            : type === 'int32'
              ? new ort.Tensor('int32', Int32Array.from([999]), [1])
              : floatTensor(type, Float32Array.from([999]), [1]);
      } else if (/encoder_hidden_states/i.test(name)) {
        const type = metaType(unet, name, hidden.type);
        feed[name] = type === hidden.type ? hidden : floatTensor(type, hiddenF32, hidden.dims);
      } else if (/sample/i.test(name)) {
        feed[name] = floatTensor(metaType(unet, name, 'float32'), scaled, LATENT);
      } else {
        throw new Error(`不認得的 UNet 輸入「${name}」，這個模型可能不是 SD-Turbo 的 ONNX 版本。`);
      }
    }
    onStatus?.('去除雜訊、生成影像（UNet）…');
    const unetOut = await unet.run(feed);
    const eps = await readFloat(unetOut[unet.outputNames[0]]);
    Object.values(unetOut).forEach((v) => v.dispose?.());
    hidden.dispose?.();
    lap('unet');
    if (lowMemory) await this.#drop('unet');

    // Euler 單步：x0 = x − σ·ε，再換回 VAE 的潛在空間尺度
    const denoised = new Float32Array(n);
    for (let i = 0; i < n; i++) denoised[i] = (latents[i] - SIGMA * eps[i]) / VAE_SCALE;

    // 4) VAE 解碼
    const vae = await this.#session('vae_decoder', onStatus);
    lap('load_vae');
    const vaeIn = vae.inputNames[0];
    onStatus?.('解碼成影像（VAE）…');
    const vaeOut = await vae.run({ [vaeIn]: floatTensor(metaType(vae, vaeIn, 'float32'), denoised, LATENT) });
    const pixels = await readFloat(vaeOut[vae.outputNames[0]]);
    Object.values(vaeOut).forEach((v) => v.dispose?.());
    lap('vae_decoder');
    if (lowMemory) await this.#drop('vae_decoder');

    const hw = IMAGE_SIZE * IMAGE_SIZE;
    const rgba = new Uint8ClampedArray(hw * 4);
    for (let i = 0; i < hw; i++) {
      rgba[i * 4] = (pixels[i] / 2 + 0.5) * 255;
      rgba[i * 4 + 1] = (pixels[hw + i] / 2 + 0.5) * 255;
      rgba[i * 4 + 2] = (pixels[2 * hw + i] / 2 + 0.5) * 255;
      rgba[i * 4 + 3] = 255;
    }
    return { imageData: new ImageData(rgba, IMAGE_SIZE, IMAGE_SIZE), truncated, timings };
  }
}
