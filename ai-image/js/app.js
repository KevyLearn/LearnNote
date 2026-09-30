import { NeuralEngine } from './neural-engine.js';
import { analyzePrompt, toEnglishPrompt, COMPOSITIONS, STYLES, EXAMPLES } from './prompt.js';
import { randomSeed } from './rng.js';
import { addImage, listImages, deleteImage, clearImages, makeThumbnail } from './gallery.js';
import { MODEL_FILES, DEFAULT_MODEL_BASE, modelStatus, downloadModel, importModel, deleteAllModels, hasCacheStorage } from './model-store.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(
  [
    'offlineBadge', 'netBadge', 'canvasWrap', 'out', 'placeholder', 'progress', 'progressBar', 'progressLabel', 'meta',
    'btnDownload', 'btnShare', 'btnAnimate', 'btnVary', 'prompt', 'examples', 'promptHint', 'btnGenerate',
    'optComp', 'optStyle', 'optAspect', 'optSize', 'optQuality', 'optCount', 'optSeed', 'optRandom', 'optAutosave',
    'sdPanel', 'sdStatus', 'modelList', 'sdProgress', 'sdProgressBar', 'sdProgressLabel', 'btnSdDownload', 'btnSdDelete',
    'optLowMem', 'optModelBase', 'optProvider', 'gallery', 'galleryCount', 'galleryEmpty', 'btnClearGallery',
    'deviceInfo', 'storageInfo', 'btnInstall', 'iosHint', 'viewer', 'viewerImg', 'viewerMeta', 'vDownload', 'vShare',
    'vApply', 'vDelete', 'toast', 'fileImport',
  ].map((id) => [id, $(id)]),
);

const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

const state = {
  engine: 'neural',
  busy: false,
  cancel: false,
  neural: null,
  neuralError: null,
  neuralWarm: false,
  sd: null,
  sdModule: null,
  sdCheck: null,
  lastJob: null,
  lastMeta: null,
  lastBlob: null,
  stopAnim: null,
  downloadCtl: null,
  importKey: null,
  viewerItem: null,
  viewerUrl: null,
  galleryUrls: [],
  installEvt: null,
};

// ---------- 小工具 ----------
const SETTINGS_KEY = 'ai-image-settings-v1';
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSettings() {
  const s = {
    engine: state.engine,
    prompt: els.prompt.value,
    comp: els.optComp.value,
    style: els.optStyle.value,
    aspect: els.optAspect.value,
    size: els.optSize.value,
    quality: els.optQuality.value,
    count: els.optCount.value,
    seed: els.optSeed.value,
    random: els.optRandom.checked,
    autosave: els.optAutosave.checked,
    lowMem: els.optLowMem.checked,
    modelBase: els.optModelBase.value,
    provider: els.optProvider.value,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 私密模式等情況下無法儲存，忽略 */
  }
}

let toastTimer = 0;
function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), isError ? 6000 : 3000);
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function fillSelect(sel, entries) {
  sel.replaceChildren(...Object.entries(entries).map(([v, label]) => new Option(label, v)));
}

function setIf(sel, value) {
  if (value !== undefined && [...sel.options].some((o) => o.value === String(value))) sel.value = String(value);
}

const clampSeed = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(2147483647, Math.floor(n))) : 0);

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法輸出圖片'))), 'image/png'));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function shareBlob(blob, name, text) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '離線 AI 繪圖', text });
    } catch (e) {
      if (e.name !== 'AbortError') toast('分享失敗：' + e.message, true);
    }
  } else {
    downloadBlob(blob, name);
    toast('這個瀏覽器不支援分享圖片，已改為下載');
  }
}

// 用純 ASCII 檔名，避免部分瀏覽器 / 系統把中文檔名改成 "download"
function fileName(meta) {
  const engine = meta?.engine === 'sd' ? 'sd' : 'gpu';
  return `ai-image-${engine}-${meta?.seed ?? 0}${meta?.frame ? '-frame' : ''}.png`;
}

function describeMeta(m) {
  if (!m) return '';
  const parts = [m.engine === 'sd' ? 'SD Turbo' : '內建引擎', `${m.width}×${m.height}`, `種子 ${m.seed}`];
  if (m.engine === 'neural') parts.push(`${COMPOSITIONS[m.comp] || m.comp}・${STYLES[m.style] || m.style}`);
  if (m.ms) parts.push(`${(m.ms / 1000).toFixed(m.ms < 10000 ? 2 : 1)} 秒`);
  if (m.frame) parts.push('動態畫格');
  let s = parts.join(' · ');
  if (m.engine === 'sd' && m.promptEn && m.promptEn !== m.prompt) s += `\n英文提示詞：${m.promptEn}`;
  return s;
}

// ---------- 版面狀態 ----------
function setCanvasAspect(w, h) {
  els.canvasWrap.style.setProperty('--ar', `${w} / ${h}`);
  els.canvasWrap.style.setProperty('--arn', String(w / h));
}

function showProgress(fraction, label) {
  els.progress.hidden = false;
  if (fraction !== null) els.progressBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  if (label !== undefined) els.progressLabel.textContent = label;
}

function hideProgress() {
  els.progress.hidden = true;
  els.progressBar.style.width = '0';
}

function setBusy(busy) {
  state.busy = busy;
  state.cancel = false;
  els.btnGenerate.textContent = busy ? '停止' : '生成';
  els.btnGenerate.classList.toggle('busy', busy);
  for (const b of [els.btnDownload, els.btnShare, els.btnVary]) b.disabled = busy || !state.lastMeta;
  els.btnAnimate.disabled = busy || !state.lastJob;
  if (!busy) hideProgress();
}

function outputSize() {
  const [aw, ah] = els.optAspect.value.split(':').map(Number);
  const long = Math.min(Number(els.optSize.value) || 1024, state.neural?.maxSize || 2048);
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return aw >= ah ? { W: even(long), H: even((long * ah) / aw) } : { W: even((long * aw) / ah), H: even(long) };
}

// ---------- 提示詞提示 ----------
function renderHint(parts) {
  els.promptHint.replaceChildren(
    ...parts.map((p) => {
      if (typeof p === 'string') return document.createTextNode(p);
      const b = document.createElement('b');
      b.textContent = p.b;
      return b;
    }),
  );
}

let hintTimer = 0;
function updatePromptHint() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    const text = els.prompt.value.trim();
    if (state.engine === 'sd') {
      const { text: en, unknown } = toEnglishPrompt(text);
      if (!text) return renderHint(['請輸入描述（英文效果最好，例如 "a cozy cabin in snowy mountains, sunset, oil painting"）']);
      if (en === text) return renderHint(['提示詞會直接送進 CLIP 文字編碼器。']);
      const parts = ['送進模型的英文：', { b: en || '（無）' }];
      if (unknown.length) parts.push(`　・無法翻譯：${unknown.join('、')}（可改用英文）`);
      return renderHint(parts);
    }
    const a = analyzePrompt(text, 0, { comp: els.optComp.value, style: els.optStyle.value });
    const hasComp = els.optComp.value !== 'auto' || a.keywords.length;
    const parts = [];
    if (a.keywords.length) {
      parts.push('辨識到：');
      a.keywords.forEach((k, i) => parts.push(...(i ? ['、'] : []), { b: k }));
      parts.push('　→　');
    } else {
      parts.push('沒有辨識到關鍵字，會隨機配色（試試：山、海、夕陽、星空、花、霓虹、水彩…）　→　');
    }
    parts.push(`構圖：${hasComp ? COMPOSITIONS[a.comp] : '隨機'}・風格：${STYLES[a.style]}`);
    renderHint(parts);
  }, 120);
}

// ---------- 生成 ----------
async function onGenerate(_event, forceRandom = false) {
  if (state.busy) {
    state.cancel = true;
    els.btnGenerate.textContent = '停止中…';
    return;
  }
  stopAnimation();
  const prompt = els.prompt.value.trim();
  const count = Number(els.optCount.value) || 1;
  const seed0 = forceRandom || els.optRandom.checked ? randomSeed() : clampSeed(Number(els.optSeed.value));
  // 畫布即將被覆寫，舊的結果不能再被下載 / 分享
  state.lastMeta = state.lastBlob = state.lastJob = null;
  setBusy(true);
  try {
    for (let i = 0; i < count && !state.cancel; i++) {
      const seed = (seed0 + i) % 2147483648;
      els.optSeed.value = seed;
      const tag = count > 1 ? `（${i + 1}/${count}）` : '';
      if (state.engine === 'sd') await generateSd(prompt, seed, tag);
      else await generateNeural(prompt, seed, tag);
    }
  } catch (e) {
    console.error(e);
    els.meta.textContent = '發生錯誤：' + (e.message || e);
    toast(e.message || String(e), true);
  } finally {
    setBusy(false);
    saveSettings();
  }
}

async function generateNeural(prompt, seed, tag) {
  if (!state.neural) throw new Error(state.neuralError || '內建引擎無法啟動');
  const { W, H } = outputSize();
  const job = state.neural.prepare(prompt, seed, { comp: els.optComp.value, style: els.optStyle.value });
  setCanvasAspect(W, H);
  els.canvasWrap.classList.add('has-image');
  showProgress(0, state.neuralWarm ? `GPU 繪製中${tag}…` : '編譯 GPU 程式（只有第一次會比較久）…');
  const t0 = performance.now();
  const done = await state.neural.render(job, {
    width: W,
    height: H,
    quality: Number(els.optQuality.value),
    target: els.out,
    onProgress: (p) => {
      state.neuralWarm = true;
      showProgress(p, `GPU 繪製中${tag}… ${Math.round(p * 100)}%`);
    },
    isCancelled: () => state.cancel,
  });
  state.neuralWarm = true;
  if (!done) {
    els.meta.textContent = '已停止';
    return;
  }
  state.lastJob = job;
  await finish({
    engine: 'neural',
    prompt,
    seed,
    width: W,
    height: H,
    comp: job.analysis.comp,
    style: job.analysis.style,
    settings: {
      comp: els.optComp.value,
      style: els.optStyle.value,
      aspect: els.optAspect.value,
      size: els.optSize.value,
      quality: els.optQuality.value,
    },
    ms: performance.now() - t0,
  });
}

async function loadSdModule() {
  state.sdModule ??= await import('./sd-engine.js');
  return state.sdModule;
}

async function ensureSd() {
  if (!hasCacheStorage()) throw new Error('這個瀏覽器無法使用 Cache Storage（需要 HTTPS），無法儲存模型。');
  const status = await modelStatus();
  const missing = MODEL_FILES.filter((f) => !status[f.key]);
  if (missing.length) throw new Error(`請先下載或匯入模型檔（缺少：${missing.map((f) => f.label).join('、')}）`);
  const mod = await loadSdModule();
  const provider = els.optProvider.value;
  if (provider === 'webgpu') {
    state.sdCheck ??= await mod.checkWebGPU();
    if (!state.sdCheck.ok) throw new Error(`${state.sdCheck.reason}。請改用內建引擎。`);
  }
  if (!state.sd || state.sd.provider !== provider) {
    await state.sd?.unload();
    state.sd = new mod.SdTurboEngine({ provider });
  }
  return state.sd;
}

async function generateSd(prompt, seed, tag) {
  const { text: en } = toEnglishPrompt(prompt);
  if (!en) throw new Error('請輸入描述（建議使用英文）');
  showProgress(0.02, `準備 SD Turbo${tag}…`);
  const sd = await ensureSd();
  let step = 0;
  const t0 = performance.now();
  const res = await sd.generate({
    prompt: en,
    seed,
    lowMemory: els.optLowMem.checked,
    onStatus: (m) => showProgress(Math.min(0.95, (++step + 1) / 9), `${m}${tag}`),
  });
  const ms = performance.now() - t0;
  els.out.width = res.imageData.width;
  els.out.height = res.imageData.height;
  els.out.getContext('2d').putImageData(res.imageData, 0, 0);
  setCanvasAspect(res.imageData.width, res.imageData.height);
  els.canvasWrap.classList.add('has-image');
  state.lastJob = null;
  if (res.truncated) toast('提示詞太長，超過 75 個 token 的部分被截掉了');
  console.info('SD Turbo timings (ms)', res.timings);
  await finish({ engine: 'sd', prompt, promptEn: en, seed, width: res.imageData.width, height: res.imageData.height, ms });
}

async function finish(meta) {
  els.meta.textContent = describeMeta(meta);
  showProgress(1, '輸出圖片…');
  state.lastBlob = await canvasBlob(els.out);
  state.lastMeta = meta;
  if (els.optAutosave.checked) {
    try {
      await addImage({ blob: state.lastBlob, thumb: await makeThumbnail(els.out), meta });
      renderGallery();
    } catch (e) {
      toast('無法存入作品集：' + e.message, true);
    }
  }
}

// ---------- 動態模式 ----------
function toggleAnimation() {
  if (state.stopAnim) return stopAnimation(true);
  if (!state.lastJob || !state.neural) return;
  els.btnAnimate.textContent = '停止';
  for (const b of [els.btnDownload, els.btnShare, els.btnVary]) b.disabled = true;
  state.stopAnim = state.neural.animate(state.lastJob, {
    target: els.out,
    size: isMobile ? 360 : 512,
    onFrame: (err) => {
      if (err) {
        stopAnimation(true);
        toast(err.message, true);
      }
    },
  });
}

function stopAnimation(keepFrame = false) {
  if (!state.stopAnim) return;
  state.stopAnim();
  state.stopAnim = null;
  els.btnAnimate.textContent = '動態';
  for (const b of [els.btnDownload, els.btnShare, els.btnVary]) b.disabled = !state.lastMeta;
  if (keepFrame && state.lastMeta) {
    state.lastMeta = { ...state.lastMeta, width: els.out.width, height: els.out.height, frame: true, ms: 0 };
    els.meta.textContent = describeMeta(state.lastMeta);
    state.lastBlob = null;
  }
}

async function currentBlob() {
  state.lastBlob ??= await canvasBlob(els.out);
  return state.lastBlob;
}

// ---------- 作品集 ----------
async function renderGallery() {
  let items;
  try {
    items = await listImages();
  } catch {
    els.galleryEmpty.textContent = '這個瀏覽器無法使用本機作品集（可能是私密瀏覽模式）。';
    els.btnClearGallery.hidden = true;
    return;
  }
  state.galleryUrls.forEach((u) => URL.revokeObjectURL(u));
  state.galleryUrls = [];
  els.gallery.replaceChildren(
    ...items.map((item) => {
      const url = URL.createObjectURL(item.thumb || item.blob);
      state.galleryUrls.push(url);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.meta?.prompt || '(無描述)';
      const img = document.createElement('img');
      img.src = url;
      img.alt = item.meta?.prompt || 'AI 圖片';
      img.loading = 'lazy';
      btn.append(img);
      btn.addEventListener('click', () => openViewer(item));
      return btn;
    }),
  );
  els.galleryCount.textContent = items.length ? `${items.length} 張` : '';
  els.galleryEmpty.hidden = items.length > 0;
  els.btnClearGallery.hidden = items.length === 0;
  updateStorageInfo();
}

function openViewer(item) {
  state.viewerItem = item;
  if (state.viewerUrl) URL.revokeObjectURL(state.viewerUrl);
  state.viewerUrl = URL.createObjectURL(item.blob);
  els.viewerImg.src = state.viewerUrl;
  els.viewerImg.alt = item.meta?.prompt || 'AI 圖片';
  const date = new Date(item.createdAt).toLocaleString('zh-TW');
  els.viewerMeta.textContent = `${item.meta?.prompt || '(無描述)'}\n${describeMeta(item.meta)} · ${date}`;
  els.viewerMeta.style.whiteSpace = 'pre-line';
  els.viewer.showModal();
}

function applyMeta(m) {
  if (!m) return;
  setEngine(m.engine === 'sd' ? 'sd' : 'neural');
  els.prompt.value = m.prompt || '';
  els.optSeed.value = m.seed;
  els.optRandom.checked = false;
  if (m.settings) {
    setIf(els.optComp, m.settings.comp);
    setIf(els.optStyle, m.settings.style);
    setIf(els.optAspect, m.settings.aspect);
    setIf(els.optSize, m.settings.size);
    setIf(els.optQuality, m.settings.quality);
  }
  updatePromptHint();
  saveSettings();
}

// ---------- SD Turbo 面板 ----------
function li(label, value, cls) {
  const el = document.createElement('li');
  const a = document.createElement('span');
  a.textContent = label;
  const b = document.createElement('span');
  b.textContent = value;
  if (cls) b.className = cls;
  el.append(a, b);
  return el;
}

async function refreshSdPanel() {
  const mod = await loadSdModule();
  state.sdCheck ??= await mod.checkWebGPU();
  const c = state.sdCheck;
  const items = [
    c.ok ? li('WebGPU', `✓ ${c.name}`, 'ok-text') : li('WebGPU', `✗ ${c.reason}`, 'err-text'),
  ];
  if (c.ok) {
    items.push(c.f16 ? li('半精度 (shader-f16)', '✓ 支援', 'ok-text') : li('半精度 (shader-f16)', '✗ 不支援，fp16 模型可能無法執行', 'warn-text'));
  }
  if (navigator.deviceMemory) {
    items.push(li('裝置記憶體', `約 ${navigator.deviceMemory} GB${navigator.deviceMemory >= 8 ? ' 以上' : ''}`, navigator.deviceMemory < 8 ? 'warn-text' : 'ok-text'));
  }
  if (!hasCacheStorage()) items.push(li('本機儲存', '✗ 需要 HTTPS 才能儲存模型', 'err-text'));
  els.sdStatus.replaceChildren(...items);

  const st = hasCacheStorage() ? await modelStatus() : {};
  els.modelList.replaceChildren(
    ...MODEL_FILES.map((f) => {
      const info = st[f.key];
      const row = li(f.label, info ? `✓ ${fmtBytes(info.size)}` : '未下載', info ? 'ok-text' : 'muted');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '匯入檔案';
      btn.title = `從本機選擇 ${f.path}`;
      btn.disabled = !!state.downloadCtl;
      btn.addEventListener('click', () => {
        state.importKey = f.key;
        els.fileImport.value = '';
        els.fileImport.click();
      });
      row.append(btn);
      return row;
    }),
  );
  const ready = MODEL_FILES.every((f) => st[f.key]);
  if (!state.downloadCtl) {
    els.btnSdDownload.textContent = ready ? '✓ 模型已就緒' : '下載全部模型（約 2.5 GB）';
    els.btnSdDownload.disabled = ready || !hasCacheStorage();
  }
  els.btnSdDelete.disabled = !MODEL_FILES.some((f) => st[f.key]);
  updateStorageInfo();
}

async function downloadAllModels() {
  if (state.downloadCtl) {
    state.downloadCtl.abort();
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  const st = await modelStatus();
  const missing = MODEL_FILES.filter((f) => !st[f.key]);
  if (!missing.length) return;
  const ctl = new AbortController();
  state.downloadCtl = ctl;
  els.btnSdDownload.textContent = '取消下載';
  els.btnSdDownload.disabled = false;
  els.sdProgress.hidden = false;
  let last = 0;
  try {
    for (const [i, f] of missing.entries()) {
      await downloadModel(f, els.optModelBase.value.trim() || DEFAULT_MODEL_BASE, {
        signal: ctl.signal,
        onProgress: (loaded, total) => {
          const now = performance.now();
          if (now - last < 120) return;
          last = now;
          els.sdProgressBar.style.width = total ? `${(loaded / total) * 100}%` : '50%';
          els.sdProgressLabel.textContent = `${f.label}（${i + 1}/${missing.length}）${fmtBytes(loaded)}${total ? ' / ' + fmtBytes(total) : ''}`;
        },
      });
      await refreshSdPanel();
    }
    toast('模型已存到這台裝置，之後可離線使用');
  } catch (e) {
    if (e.name === 'AbortError') toast('已取消下載');
    else toast(`${e.message}${navigator.onLine ? '' : '（目前離線，可改用「匯入檔案」）'}`, true);
  } finally {
    state.downloadCtl = null;
    els.sdProgress.hidden = true;
    els.sdProgressBar.style.width = '0';
    refreshSdPanel();
  }
}

async function onImportFile() {
  const file = els.fileImport.files?.[0];
  const def = MODEL_FILES.find((f) => f.key === state.importKey);
  if (!file || !def) return;
  els.sdProgress.hidden = false;
  els.sdProgressBar.style.width = '60%';
  els.sdProgressLabel.textContent = `匯入 ${def.label}：${file.name}（${fmtBytes(file.size)}）…`;
  try {
    navigator.storage?.persist?.().catch(() => {});
    await state.sd?.unload();
    await importModel(def, file);
    toast(`已匯入 ${def.label}`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    els.sdProgress.hidden = true;
    refreshSdPanel();
  }
}

// ---------- 引擎切換 ----------
function setEngine(engine) {
  state.engine = engine;
  document.querySelectorAll('.engine-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.engine === engine)));
  document.querySelectorAll('.neural-only').forEach((el) => el.classList.toggle('hidden-by-engine', engine !== 'neural'));
  els.sdPanel.hidden = engine !== 'sd';
  els.btnGenerate.disabled = engine === 'neural' && !state.neural;
  if (engine === 'sd') {
    refreshSdPanel().catch((e) => toast(e.message, true));
  } else if (state.sd) {
    state.sd.unload(); // 回到內建引擎時釋放 SD 佔用的 GPU 記憶體
  }
  updatePromptHint();
  saveSettings();
}

// ---------- 裝置與離線狀態 ----------
function setBadge(el, text, cls = '') {
  el.textContent = text;
  el.className = `badge ${cls}`;
}

function updateNetBadge() {
  if (navigator.onLine) setBadge(els.netBadge, '連線中');
  else setBadge(els.netBadge, '離線模式', 'ok');
}

async function updateStorageInfo() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    els.storageInfo.textContent = `本機儲存：已用 ${fmtBytes(usage)}／可用上限約 ${fmtBytes(quota)}`;
  } catch {
    /* 忽略 */
  }
}

function updateDeviceInfo() {
  const parts = [];
  if (state.neural) parts.push(`GPU：${state.neural.rendererInfo}（最大 ${state.neural.maxSize}px）`);
  else parts.push(`內建引擎無法使用：${state.neuralError}`);
  parts.push(`WebGPU：${'gpu' in navigator ? '有' : '無'}`);
  if (navigator.deviceMemory) parts.push(`記憶體約 ${navigator.deviceMemory} GB`);
  els.deviceInfo.textContent = parts.join('　・　');
}

function setupPwa() {
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      setBadge(els.offlineBadge, '離線快取失敗', 'warn');
      console.warn(e);
    });
    navigator.serviceWorker.ready.then(() => setBadge(els.offlineBadge, '✓ 可離線使用', 'ok'));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('已更新到新版本，重新整理即可套用');
    });
  } else {
    setBadge(els.offlineBadge, secure ? '不支援離線' : '需 HTTPS 才能離線', 'warn');
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvt = e;
    els.btnInstall.hidden = false;
  });
  els.btnInstall.addEventListener('click', async () => {
    if (!state.installEvt) return;
    state.installEvt.prompt();
    await state.installEvt.userChoice.catch(() => {});
    state.installEvt = null;
    els.btnInstall.hidden = true;
  });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  els.iosHint.hidden = !(isIOS && !standalone);
}

// ---------- 初始化 ----------
function init() {
  fillSelect(els.optComp, COMPOSITIONS);
  fillSelect(els.optStyle, STYLES);
  try {
    state.neural = new NeuralEngine();
  } catch (e) {
    state.neuralError = e.message;
    console.error(e);
  }
  const max = state.neural?.maxSize || 2048;
  els.optSize.replaceChildren(
    ...[512, 768, 1024, 1536, 2048].filter((s) => s <= max).map((s) => new Option(`${s} px`, String(s))),
  );
  els.examples.replaceChildren(
    ...EXAMPLES.map((ex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ex;
      b.addEventListener('click', () => {
        els.prompt.value = ex;
        updatePromptHint();
        saveSettings();
      });
      return b;
    }),
  );

  const s = loadSettings();
  els.prompt.value = s.prompt ?? EXAMPLES[0];
  setIf(els.optComp, s.comp);
  setIf(els.optStyle, s.style);
  setIf(els.optAspect, s.aspect ?? (isMobile ? '3:4' : '1:1'));
  setIf(els.optSize, s.size ?? (isMobile ? '768' : '1024'));
  setIf(els.optQuality, s.quality ?? '2');
  setIf(els.optCount, s.count);
  if (s.seed !== undefined) els.optSeed.value = clampSeed(Number(s.seed));
  if (s.random !== undefined) els.optRandom.checked = s.random;
  if (s.autosave !== undefined) els.optAutosave.checked = s.autosave;
  els.optLowMem.checked = s.lowMem ?? (isMobile || (navigator.deviceMemory || 8) < 8);
  els.optModelBase.value = s.modelBase || DEFAULT_MODEL_BASE;
  setIf(els.optProvider, s.provider);
  if (isMobile) document.getElementById('settings').removeAttribute('open');

  // 事件
  els.btnGenerate.addEventListener('click', onGenerate);
  els.prompt.addEventListener('input', () => {
    updatePromptHint();
    saveSettings();
  });
  els.prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onGenerate();
    }
  });
  for (const el of [els.optComp, els.optStyle]) el.addEventListener('change', updatePromptHint);
  for (const el of [els.optComp, els.optStyle, els.optAspect, els.optSize, els.optQuality, els.optCount, els.optSeed, els.optRandom, els.optAutosave, els.optLowMem, els.optModelBase]) {
    el.addEventListener('change', saveSettings);
  }
  els.optProvider.addEventListener('change', () => {
    saveSettings();
    state.sd?.unload();
    state.sd = null;
  });
  document.querySelectorAll('.engine-switch button').forEach((b) => b.addEventListener('click', () => !state.busy && setEngine(b.dataset.engine)));

  els.btnDownload.addEventListener('click', async () => downloadBlob(await currentBlob(), fileName(state.lastMeta)));
  els.btnShare.addEventListener('click', async () => shareBlob(await currentBlob(), fileName(state.lastMeta), state.lastMeta?.prompt));
  els.btnAnimate.addEventListener('click', toggleAnimation);
  els.btnVary.addEventListener('click', () => onGenerate(null, true));

  els.btnClearGallery.addEventListener('click', async () => {
    if (!confirm('確定要刪除作品集中的所有圖片嗎？')) return;
    await clearImages();
    renderGallery();
  });
  els.vDownload.addEventListener('click', () => state.viewerItem && downloadBlob(state.viewerItem.blob, fileName(state.viewerItem.meta)));
  els.vShare.addEventListener('click', () => state.viewerItem && shareBlob(state.viewerItem.blob, fileName(state.viewerItem.meta), state.viewerItem.meta?.prompt));
  els.vApply.addEventListener('click', () => {
    applyMeta(state.viewerItem?.meta);
    els.viewer.close();
    toast('已套用設定，按「生成」即可重現這張圖');
  });
  els.vDelete.addEventListener('click', async () => {
    if (!state.viewerItem || !confirm('刪除這張圖片？')) return;
    await deleteImage(state.viewerItem.id);
    els.viewer.close();
    renderGallery();
  });
  els.viewer.addEventListener('close', () => {
    if (state.viewerUrl) URL.revokeObjectURL(state.viewerUrl);
    state.viewerUrl = null;
  });

  els.btnSdDownload.addEventListener('click', downloadAllModels);
  els.btnSdDelete.addEventListener('click', async () => {
    if (!confirm('刪除已下載的 SD Turbo 模型？（之後需要重新下載或匯入）')) return;
    await state.sd?.unload();
    await deleteAllModels();
    refreshSdPanel();
    toast('已刪除模型');
  });
  els.fileImport.addEventListener('change', onImportFile);

  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', updateNetBadge);

  setEngine(s.engine === 'sd' ? 'sd' : 'neural');
  if (state.neuralError) els.meta.textContent = `內建引擎無法啟動：${state.neuralError}`;
  updateNetBadge();
  updateDeviceInfo();
  setupPwa();
  renderGallery();
}

init();
