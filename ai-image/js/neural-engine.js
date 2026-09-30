// 內建引擎：WebGL2 + 程式產生的神經網路權重，完全在本機記憶體與 GPU 上運算，
// 不需要下載任何模型，也不需要網路。
import { VERTEX_SHADER, FRAGMENT_SHADER } from './neural-shader.js';
import { analyzePrompt } from './prompt.js';
import { makeRng } from './rng.js';

const COMP_ID = { abstract: 0, mandala: 1, landscape: 2, cosmos: 3, marble: 4 };
const STYLE_ID = { none: 0, watercolor: 1, oil: 2, neon: 3, pixel: 4, sketch: 5, mono: 6, vintage: 7 };

// Uniform Buffer（std140）配置：W 52×mat4、B 13×vec4、FR 8×vec4、WV 4×vec4
const OFF_B = 52 * 16;
const OFF_FR = OFF_B + 13 * 4;
const OFF_WV = OFF_FR + 8 * 4;
const UBO_FLOATS = OFF_WV + 4 * 4;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** 依種子產生一組網路權重（常態分布初始化，像沒訓練過的生成網路）。 */
export function buildNetwork(seed) {
  const rng = makeRng(seed);
  const data = new Float32Array(UBO_FLOATS);
  const gains = [rng.range(1.8, 3.0), rng.range(1.2, 2.2), rng.range(1.2, 2.2)];
  const inputScale = [1.6, 1.0, 1.0, 0.6]; // 座標、低頻、高頻、潛在向量
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 4; k++) {
        const base = (layer * 16 + i * 4 + k) * 16;
        const s = (gains[layer] / 4) * (layer === 0 ? inputScale[k] : 1);
        for (let e = 0; e < 16; e++) data[base + e] = rng.gauss() * s;
      }
    }
  }
  const gOut = rng.range(1.2, 2.0);
  for (let e = 0; e < 4 * 16; e++) data[48 * 16 + e] = (rng.gauss() * gOut) / 4;
  for (let i = 0; i < 48; i++) data[OFF_B + i] = rng.gauss() * 0.4;
  for (let i = 0; i < 4; i++) data[OFF_B + 48 + i] = rng.gauss() * 0.3;
  for (let i = 0; i < 8; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const mag = i < 4 ? rng.range(0.6, 2.4) : rng.range(2.5, 7.0);
    data.set([Math.cos(ang) * mag, Math.sin(ang) * mag, rng.range(0, Math.PI * 2), 0], OFF_FR + i * 4);
  }
  for (let i = 0; i < 4; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const mag = rng.range(0.6, 2.6);
    data.set([Math.cos(ang) * mag, Math.sin(ang) * mag, rng.range(0, Math.PI * 2), rng.range(0.4, 1.0)], OFF_WV + i * 4);
  }
  const latent = [rng.gauss(), rng.gauss(), rng.gauss(), rng.gauss()];
  const acts = [rng.chance(0.6) ? 1 : 0, rng.pick([0, 2, 3]), rng.pick([0, 1, 2])];
  return { data, latent, acts };
}

/** 在兩組權重之間做球面插值（保持常態分布的變異數），用於動態模式。 */
export function mixNetworks(a, b, t) {
  const th = (t * Math.PI) / 2;
  const ca = Math.cos(th);
  const sb = Math.sin(th);
  const data = new Float32Array(UBO_FLOATS);
  for (let i = 0; i < OFF_FR; i++) data[i] = a.data[i] * ca + b.data[i] * sb;
  for (let i = OFF_FR; i < UBO_FLOATS; i++) data[i] = a.data[i] + (b.data[i] - a.data[i]) * t;
  const latent = a.latent.map((v, i) => v * ca + b.latent[i] * sb);
  return { data, latent, acts: a.acts };
}

export class NeuralEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 16;
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('此瀏覽器不支援 WebGL2，無法使用 GPU 繪圖。');
    this.gl = gl;
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.#init();
    });
    this.#init();
  }

  #init() {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('著色器編譯失敗：' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('著色器連結失敗：' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const blockIndex = gl.getUniformBlockIndex(prog, 'Net');
    gl.uniformBlockBinding(prog, blockIndex, 0);
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, UBO_FLOATS * 4, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);

    this.loc = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const loc = gl.getUniformLocation(prog, info.name);
      if (loc) this.loc[info.name.replace(/\[0\]$/, '')] = loc;
    }
  }

  get maxSize() {
    const gl = this.gl;
    const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), dims[0], dims[1], 4096);
  }

  get rendererInfo() {
    const gl = this.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }

  /** 由提示詞與種子建立一個生成工作。 */
  prepare(prompt, seed, overrides) {
    const analysis = analyzePrompt(prompt, seed, overrides);
    return { analysis, net: buildNetwork(analysis.baseSeed) };
  }

  #setUniforms(analysis, net, time) {
    const gl = this.gl;
    const L = this.loc;
    const { params: p, flags: f, scene: s } = analysis;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, net.data);
    gl.uniform1i(L.uComp, COMP_ID[analysis.comp] ?? 0);
    gl.uniform1i(L.uStyle, STYLE_ID[analysis.style] ?? 0);
    gl.uniform3i(L.uAct, net.acts[0], net.acts[1], net.acts[2]);
    gl.uniform4fv(L.uLatent, net.latent);
    gl.uniform3fv(L.uPal, analysis.palette.flat());
    gl.uniform1f(L.uWarp, p.warp);
    gl.uniform1f(L.uDetail, p.detail);
    gl.uniform1f(L.uContrast, p.contrast);
    gl.uniform1f(L.uSat, p.sat);
    gl.uniform1f(L.uGlow, p.glow);
    gl.uniform1f(L.uDark, p.dark);
    gl.uniform1f(L.uGrain, p.grain);
    gl.uniform1f(L.uVignette, p.vignette);
    gl.uniform1f(L.uZoom, p.zoom);
    gl.uniform1f(L.uSym, p.sym);
    gl.uniform1f(L.uSeedF, (analysis.baseSeed % 1000) / 10);
    gl.uniform1f(L.uPixelGrid, 96);
    gl.uniform1f(L.uTime, time);
    const b = (v) => (v ? 1 : 0);
    gl.uniform4f(L.uFlagsA, b(f.water), b(f.sun), b(f.moon), b(f.stars));
    gl.uniform4f(L.uFlagsB, b(f.snow), b(f.aurora), b(f.fog), b(f.clouds));
    gl.uniform4f(L.uFlagsC, b(f.forest), b(f.night), b(f.planet), 0);
    gl.uniform4f(L.uScene, s.horizon ?? 0.3, s.sunX ?? 0, s.sunY ?? 0.7, s.sunR ?? 0.06);
    gl.uniform4f(L.uScene2, s.planetX ?? 0, s.planetY ?? 0, s.planetR ?? 0.3, 0);
  }

  #setView(w, h, ss, W, H) {
    const gl = this.gl;
    gl.uniform2f(this.loc.uView, w, h);
    gl.uniform2f(this.loc.uAspect, W >= H ? W / H : 1, W >= H ? 1 : H / W);
    gl.uniform1i(this.loc.uSS, ss);
  }

  /** 讓出一個畫面，並等 GPU 真正做完目前的指令（避免指令堆積造成卡頓）。 */
  async #waitGpu() {
    const gl = this.gl;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    try {
      for (;;) {
        await nextFrame();
        if (this.lost || !sync) return;
        const st = gl.clientWaitSync(sync, 0, 0);
        if (st !== gl.TIMEOUT_EXPIRED) return;
      }
    } finally {
      if (sync) gl.deleteSync(sync);
    }
  }

  #checkLost() {
    if (this.lost || this.gl.isContextLost()) throw new Error('GPU 內容遺失（可能是記憶體不足），請降低解析度後重試。');
  }

  /**
   * 產生一張圖，逐步畫到 target（2D canvas）上：先出低解析度預覽，再分塊算出完整畫質。
   * @param {{width:number,height:number,quality:number,target:HTMLCanvasElement,onProgress?:Function,isCancelled?:Function}} o
   */
  async render(job, { width: W, height: H, quality = 2, target, onProgress, isCancelled }) {
    const gl = this.gl;
    this.#checkLost();
    this.canvas.width = W;
    this.canvas.height = H;
    target.width = W;
    target.height = H;
    const ctx = target.getContext('2d');
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    this.#setUniforms(job.analysis, job.net, 0);

    const ss = job.analysis.style === 'pixel' ? 1 : Math.max(1, Math.min(4, quality | 0));
    const shortSide = Math.min(W, H);

    // 1) 低解析度預覽（由模糊到清晰）
    gl.disable(gl.SCISSOR_TEST);
    for (const f of [24, 8]) {
      if (shortSide / f < 16) continue;
      const w = Math.max(1, Math.round(W / f));
      const h = Math.max(1, Math.round(H / f));
      gl.viewport(0, 0, w, h);
      this.#setView(w, h, 1, W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.canvas, 0, H - h, w, h, 0, 0, W, H);
      await this.#waitGpu();
      this.#checkLost();
      if (isCancelled?.()) return false;
    }

    // 2) 完整解析度，分塊計算以免手機 GPU 逾時
    gl.viewport(0, 0, W, H);
    this.#setView(W, H, ss, W, H);
    gl.enable(gl.SCISSOR_TEST);
    const heavy = job.analysis.comp === 'landscape' || job.analysis.flags.planet;
    const tile = Math.round((ss >= 3 ? 160 : ss === 2 ? 224 : 320) * (heavy ? 0.75 : 1));
    const cols = Math.ceil(W / tile);
    const rows = Math.ceil(H / tile);
    const total = cols * rows;
    let done = 0;
    try {
      for (let r = 0; r < rows; r++) {
        const y = r * tile;
        const th = Math.min(tile, H - y);
        for (let c = 0; c < cols; c++) {
          const x = c * tile;
          const tw = Math.min(tile, W - x);
          gl.scissor(x, H - y - th, tw, th);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          ctx.drawImage(this.canvas, x, y, tw, th, x, y, tw, th);
          await this.#waitGpu();
          done++;
          onProgress?.(done / total);
          this.#checkLost();
          if (isCancelled?.()) return false;
        }
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
    }
    return true;
  }

  /** 動態模式：在不同種子的網路之間平滑變形，持續繪製到 target。回傳停止函式。 */
  animate(job, { target, size = 480, onFrame }) {
    const gl = this.gl;
    const aspect = target.width / target.height || 1;
    const W = aspect >= 1 ? Math.round(size * aspect) : size;
    const H = aspect >= 1 ? size : Math.round(size / aspect);
    this.canvas.width = W;
    this.canvas.height = H;
    target.width = W;
    target.height = H;
    const ctx = target.getContext('2d');
    let from = job.net;
    let k = 1;
    let to = buildNetwork((job.analysis.baseSeed + k * 7919) >>> 0);
    let t0 = performance.now();
    const period = 6000;
    let running = true;
    let raf = 0;
    let fence = null;
    const frame = (now) => {
      if (!running) return;
      if (this.lost || gl.isContextLost()) {
        running = false;
        onFrame?.(new Error('GPU 內容遺失'));
        return;
      }
      if (fence) {
        // 上一格還沒畫完就先跳過，GPU 慢的手機會自動降低幀率
        if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
          raf = requestAnimationFrame(frame);
          return;
        }
        gl.deleteSync(fence);
        fence = null;
      }
      let t = (now - t0) / period;
      if (t >= 1) {
        from = to;
        k++;
        to = buildNetwork((job.analysis.baseSeed + k * 7919) >>> 0);
        t0 = now;
        t = 0;
      }
      const eased = t * t * (3 - 2 * t);
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      gl.disable(gl.SCISSOR_TEST);
      this.#setUniforms(job.analysis, mixNetworks(from, to, eased), now / 4000);
      gl.viewport(0, 0, W, H);
      this.#setView(W, H, 1, W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.drawImage(this.canvas, 0, 0);
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      onFrame?.(null);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (fence) gl.deleteSync(fence);
      fence = null;
    };
  }
}
