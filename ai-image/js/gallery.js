// 作品集：圖片與設定存在瀏覽器的 IndexedDB（本機，不會上傳）。

const DB_NAME = 'ai-image-gallery';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('createdAt', 'createdAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('交易中止'));
      }),
  );
}

/** 從 canvas 產生縮圖（JPEG）。 */
export function makeThumbnail(canvas, max = 320) {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * scale));
  c.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

export async function addImage({ blob, thumb, meta }) {
  return tx('readwrite', (s) => s.add({ blob, thumb, meta, createdAt: Date.now() }));
}

/** 取得全部作品（新到舊）。 */
export async function listImages() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getImage(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function deleteImage(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export async function clearImages() {
  return tx('readwrite', (s) => s.clear());
}
