// SD 模型檔的本機儲存（Cache Storage）。下載或匯入一次後即可離線使用。

const CACHE_NAME = 'sd-turbo-models-v1';

// schmuell/sd-turbo-ort-web：微軟 onnxruntime 官方 WebGPU 範例使用的 SD-Turbo（fp16）轉檔
export const DEFAULT_MODEL_BASE = 'https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/';

export const MODEL_FILES = [
  { key: 'text_encoder', label: '文字編碼器（CLIP）', path: 'text_encoder/model.onnx' },
  { key: 'unet', label: 'UNet 去噪網路', path: 'unet/model.onnx' },
  { key: 'vae_decoder', label: 'VAE 影像解碼器', path: 'vae_decoder/model.onnx' },
];

const entryUrl = (key) => new URL(`sd-models/${key}.onnx`, location.href).href;
const metaUrl = (key) => new URL(`sd-models/${key}.json`, location.href).href;

const openCache = () => caches.open(CACHE_NAME);

export const hasCacheStorage = () => typeof caches !== 'undefined';

/** 每個模型檔是否已存在本機，以及大小。 */
export async function modelStatus() {
  const status = {};
  if (!hasCacheStorage()) return status;
  const cache = await openCache();
  for (const f of MODEL_FILES) {
    const [data, meta] = await Promise.all([cache.match(entryUrl(f.key)), cache.match(metaUrl(f.key))]);
    let info = null;
    if (data && meta) {
      try {
        info = await meta.json();
      } catch {
        info = {};
      }
    }
    status[f.key] = info;
  }
  return status;
}

async function looksLikeOnnx(blobOrBytes) {
  const head = blobOrBytes instanceof Blob ? new Uint8Array(await blobOrBytes.slice(0, 2).arrayBuffer()) : blobOrBytes.subarray(0, 2);
  // ONNX 是 protobuf：第一個欄位通常是 ir_version（tag 0x08）
  return head.length === 2 && head[0] === 0x08;
}

async function writeEntry(key, body, size, source) {
  const cache = await openCache();
  await cache.put(entryUrl(key), new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } }));
  await cache.put(
    metaUrl(key),
    new Response(JSON.stringify({ size, source, savedAt: Date.now() }), { headers: { 'Content-Type': 'application/json' } }),
  );
}

/** 從網路下載一個模型檔並存入本機，onProgress(已下載位元組, 總位元組)。 */
export async function downloadModel(file, baseUrl, { onProgress, signal } = {}) {
  const url = new URL(file.path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').href;
  const res = await fetch(url, { signal, mode: 'cors' });
  if (!res.ok || !res.body) throw new Error(`下載失敗（HTTP ${res.status}）：${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let loaded = 0;
  const counter = new TransformStream({
    transform(chunk, ctrl) {
      loaded += chunk.byteLength;
      onProgress?.(loaded, total);
      ctrl.enqueue(chunk);
    },
  });
  await writeEntry(file.key, res.body.pipeThrough(counter), total, url);
  const cache = await openCache();
  const check = await cache.match(entryUrl(file.key));
  const head = new Uint8Array(await (await check.blob()).slice(0, 2).arrayBuffer());
  if (!(await looksLikeOnnx(head))) {
    await deleteModel(file.key);
    throw new Error('下載的檔案不是 ONNX 模型，請確認模型網址。');
  }
  return loaded;
}

/** 從使用者選擇的本機檔案匯入（完全不需網路）。 */
export async function importModel(file, blob) {
  if (!(await looksLikeOnnx(blob))) throw new Error(`「${blob.name}」看起來不是 ONNX 模型檔。`);
  await writeEntry(file.key, blob, blob.size, `本機檔案：${blob.name}`);
}

export async function readModel(key) {
  const cache = await openCache();
  const res = await cache.match(entryUrl(key));
  if (!res) throw new Error(`尚未下載模型檔：${key}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteModel(key) {
  const cache = await openCache();
  await cache.delete(entryUrl(key));
  await cache.delete(metaUrl(key));
}

export async function deleteAllModels() {
  if (hasCacheStorage()) await caches.delete(CACHE_NAME);
}
