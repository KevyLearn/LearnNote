// Service Worker：把整個網站快取在裝置上，斷網也能開啟與生成圖片。
// ⚠️ 修改任何網站檔案後，請把 VERSION 加一，使用者的瀏覽器才會更新快取。
const VERSION = 'v1';
const SHELL_CACHE = `ai-image-shell-${VERSION}`;
const RUNTIME_CACHE = 'ai-image-runtime-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/rng.js',
  './js/prompt.js',
  './js/neural-engine.js',
  './js/neural-shader.js',
  './js/gallery.js',
  './js/model-store.js',
  './js/sd-engine.js',
  './js/clip-tokenizer.js',
  './assets/clip-merges.txt',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// SD Turbo 用到的 ONNX Runtime 來自 CDN：第一次使用時快取，之後離線可用
const RUNTIME_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('ai-image-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);

  if (url.origin === scope.origin) {
    if (!url.pathname.startsWith(scope.pathname)) return;
    // 模型檔由頁面直接讀寫 Cache Storage，不經過這裡
    if (url.pathname.startsWith(scope.pathname + 'sd-models/')) return;
    const storeAtRuntime = url.pathname.startsWith(scope.pathname + 'vendor/');
    event.respondWith(cacheFirst(req, storeAtRuntime));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req, true));
});

async function cacheFirst(req, storeAtRuntime) {
  const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (storeAtRuntime && res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
