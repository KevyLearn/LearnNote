// 內建引擎的 GPU 程式（GLSL ES 3.00 / WebGL2）。
// 每個像素都會跑一個 16→16→16→16→4 的小型神經網路（CPPN + 傅立葉特徵），
// 權重由提示詞與種子決定，存放在 Uniform Buffer 中；再依構圖與風格上色。

export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

layout(std140) uniform Net {
  mat4 W[52];   // 3 個隱藏層 × 16 個 4×4 區塊 + 輸出層 4 個區塊
  vec4 B[13];   // 偏差值
  vec4 FR[8];   // 傅立葉特徵：xy = 頻率向量，z = 相位
  vec4 WV[4];   // 空間扭曲：xy = 頻率，z = 相位，w = 強度
};

uniform vec2 uView;
uniform vec2 uAspect;
uniform int uSS;
uniform int uComp;
uniform int uStyle;
uniform ivec3 uAct;
uniform vec4 uLatent;
uniform vec3 uPal[5];
uniform float uWarp;
uniform float uDetail;
uniform float uContrast;
uniform float uSat;
uniform float uGlow;
uniform float uDark;
uniform float uGrain;
uniform float uVignette;
uniform float uZoom;
uniform float uSym;
uniform float uSeedF;
uniform float uPixelGrid;
uniform float uTime;
uniform vec4 uFlagsA;   // water, sun, moon, stars
uniform vec4 uFlagsB;   // snow, aurora, fog, clouds
uniform vec4 uFlagsC;   // forest, night, planet, -
uniform vec4 uScene;    // horizon, sunX, sunY, sunR
uniform vec4 uScene2;   // planetX, planetY, planetR, -

out vec4 outColor;

#define ST_NONE 0
#define ST_WATERCOLOR 1
#define ST_OIL 2
#define ST_NEON 3
#define ST_PIXEL 4
#define ST_SKETCH 5
#define ST_MONO 6
#define ST_VINTAGE 7

// ---------- 雜湊與雜訊 ----------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

// ---------- 神經網路 ----------
vec4 act(vec4 v, int k) {
  v = clamp(v, -15.0, 15.0);
  if (k == 1) return sin(v);
  if (k == 2) return exp(-v * v) * 2.0 - 1.0;
  if (k == 3) return v / (1.0 + abs(v));
  return tanh(v);
}

vec4 net(vec4 x0, vec4 x1, vec4 x2, vec4 x3) {
  vec4 a0 = act(B[0] + W[0] * x0 + W[1] * x1 + W[2] * x2 + W[3] * x3, uAct.x);
  vec4 a1 = act(B[1] + W[4] * x0 + W[5] * x1 + W[6] * x2 + W[7] * x3, uAct.x);
  vec4 a2 = act(B[2] + W[8] * x0 + W[9] * x1 + W[10] * x2 + W[11] * x3, uAct.x);
  vec4 a3 = act(B[3] + W[12] * x0 + W[13] * x1 + W[14] * x2 + W[15] * x3, uAct.x);

  vec4 b0 = act(B[4] + W[16] * a0 + W[17] * a1 + W[18] * a2 + W[19] * a3, uAct.y);
  vec4 b1 = act(B[5] + W[20] * a0 + W[21] * a1 + W[22] * a2 + W[23] * a3, uAct.y);
  vec4 b2 = act(B[6] + W[24] * a0 + W[25] * a1 + W[26] * a2 + W[27] * a3, uAct.y);
  vec4 b3 = act(B[7] + W[28] * a0 + W[29] * a1 + W[30] * a2 + W[31] * a3, uAct.y);

  vec4 c0 = act(B[8] + W[32] * b0 + W[33] * b1 + W[34] * b2 + W[35] * b3, uAct.z);
  vec4 c1 = act(B[9] + W[36] * b0 + W[37] * b1 + W[38] * b2 + W[39] * b3, uAct.z);
  vec4 c2 = act(B[10] + W[40] * b0 + W[41] * b1 + W[42] * b2 + W[43] * b3, uAct.z);
  vec4 c3 = act(B[11] + W[44] * b0 + W[45] * b1 + W[46] * b2 + W[47] * b3, uAct.z);

  return B[12] + W[48] * c0 + W[49] * c1 + W[50] * c2 + W[51] * c3;
}

// 座標 → 特徵（扭曲 + 傅立葉）→ 網路輸出
vec4 field(vec2 p) {
  vec2 q = p;
  for (int i = 0; i < 2; i++) {
    vec4 a = WV[i * 2];
    vec4 b = WV[i * 2 + 1];
    q += uWarp * a.w * vec2(sin(dot(q, a.xy) + a.z + uTime * 0.7), sin(dot(q, b.xy) + b.z - uTime * 0.5));
  }
  float r = length(q);
  vec4 x0 = vec4(q, r, sin(r * 2.5 * uDetail + uLatent.w));
  vec4 x1;
  vec4 x2;
  for (int i = 0; i < 4; i++) {
    x1[i] = sin(dot(q, FR[i].xy) * uDetail + FR[i].z);
    x2[i] = sin(dot(q, FR[i + 4].xy) * uDetail + FR[i + 4].z);
  }
  return net(x0, x1, x2, uLatent);
}

vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  int i = int(min(floor(t), 3.0));
  float f = t - float(i);
  f = f * f * (3.0 - 2.0 * f);
  return mix(uPal[i], uPal[i + 1], f);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// 霓虹：把數值場畫成發光的等高線
vec3 neonize(float t) {
  float v = t * 6.0;
  float d = abs(fract(v + 0.5) - 0.5);
  float core = 1.0 - smoothstep(0.0, 0.05, d);
  float halo = exp(-d * 7.0 / (0.6 + uGlow));
  vec3 col = pal(0.55 + 0.45 * fract(floor(v) * 0.37 + 0.2));
  return uPal[0] * 0.3 + col * (core * 1.1 + halo * 0.5);
}

// ---------- 構圖：抽象 ----------
vec3 abstractArt(vec2 p) {
  vec4 o = field(p);
  float t = 0.5 + 0.5 * tanh(o.x * uContrast * 0.8);
  if (uStyle == ST_NEON) return neonize(t);
  vec3 c = pal(t) * (0.78 + 0.22 * tanh(o.y));
  float hl = smoothstep(0.55, 1.0, 0.5 + 0.5 * tanh(o.z));
  return mix(c, uPal[4], hl * 0.7 * uGlow);
}

// ---------- 構圖：萬花筒 ----------
vec3 mandala(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float seg = 6.2831853 / uSym;
  a = mod(a, seg);
  a = abs(a - 0.5 * seg);
  vec2 q = vec2(cos(a), sin(a)) * r;
  vec4 o = field(q * 1.3);
  float rings = sin(r * 9.0 * uDetail + o.w * 1.5);
  float t = 0.5 + 0.5 * tanh((o.x + 0.5 * rings) * uContrast * 0.8);
  vec3 c;
  if (uStyle == ST_NEON) {
    c = neonize(t);
  } else {
    c = pal(t) * (0.8 + 0.2 * tanh(o.y));
    float hl = smoothstep(0.6, 1.0, 0.5 + 0.5 * tanh(o.z));
    c = mix(c, uPal[4], hl * 0.6 * uGlow);
  }
  return mix(c, uPal[0] * 0.6, smoothstep(0.95, 1.45, r) * 0.85);
}

// ---------- 構圖：大理石 / 流體 ----------
vec3 marble(vec2 p) {
  vec4 o = field(p);
  float v = o.x * 2.2 + o.w * 0.8;
  float t = 0.5 + 0.5 * sin(v * 2.0);
  if (uStyle == ST_NEON) return neonize(t);
  vec3 c = pal(t) * (0.85 + 0.15 * tanh(o.z));
  float vein = pow(1.0 - abs(sin(v * 3.0 + o.y)), 16.0);
  vec3 veinCol = luma(uPal[2]) > 0.5 ? uPal[0] : uPal[4];
  return mix(c, veinCol, vein * 0.7);
}

// ---------- 星星 ----------
float stars(vec2 p, float px) {
  float s = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 14.0 * pow(2.3, fl);
    vec2 g = p * sc + fl * 31.7 + uSeedF;
    vec2 id = floor(g);
    float h = hash12(id);
    if (h > 0.9) {
      vec2 off = vec2(hash12(id + 3.1), hash12(id + 7.7)) * 0.7 + 0.15;
      float d = length(fract(g) - off) / sc;
      float b = (h - 0.9) / 0.1;
      float size = px * (0.6 + 1.4 * b) / (1.0 + fl * 0.25);
      s += (0.2 + 0.8 * b * b) * exp(-d * d / (size * size));
    }
  }
  return s;
}

// ---------- 構圖：宇宙 ----------
vec3 cosmos(vec2 p, float px) {
  vec4 o = field(p * 0.9);
  float dens = smoothstep(-0.3, 1.4, o.x * 0.8 + o.w * 0.6);
  float dens2 = smoothstep(0.2, 1.6, o.z);
  vec3 c = mix(uPal[0] * 0.5, pal(0.25 + 0.7 * (0.5 + 0.5 * tanh(o.y))), dens * 0.85);
  c += pal(0.9) * dens2 * 0.5 * uGlow;
  c += stars(p, px) * mix(vec3(1.0), pal(0.85), 0.3) * (1.0 - dens * 0.5);

  if (uFlagsC.z > 0.5) {
    vec2 d = (p - uScene2.xy) / uScene2.z;
    float rr = length(d);
    float aa = px / uScene2.z * 1.5;
    if (rr < 1.0 + aa) {
      float z = sqrt(max(0.0, 1.0 - rr * rr));
      vec3 n = vec3(d, z);
      float diff = max(dot(n, normalize(vec3(-0.6, 0.5, 0.6))), 0.0);
      vec2 sp = vec2(atan(n.x, n.z), n.y) * 1.4;
      vec4 po = field(sp * 1.2 + 5.0);
      vec3 pc = pal(0.3 + 0.6 * (0.5 + 0.5 * tanh(po.x * 1.5 + n.y * 2.5)));
      pc *= 0.06 + 0.94 * diff;
      c = mix(c, pc, smoothstep(1.0 + aa, 1.0 - aa, rr));
    }
    c += pal(0.85) * exp(-max(rr - 1.0, 0.0) * 14.0) * 0.35 * step(1.0, rr);
  }
  return c;
}

// ---------- 構圖：山水風景（座標 L：x 以畫面中心為 0，y 由下往上 0→1）----------
float ridgeH(float x, int k) {
  float fk = float(k);
  vec4 o = field(vec2(x * (0.9 + 0.5 * fk) + fk * 7.31, fk * 1.93 - 3.0));
  float base = uScene.x + 0.24 - 0.06 * fk;
  float amp = 0.13 - 0.02 * fk;
  float rough = fbm(vec2(x * (6.0 + 3.0 * fk) + fk * 13.0 + uSeedF, fk)) - 0.5;
  float h = base + amp * tanh(o.x * 0.8) + rough * (0.05 + 0.02 * fk) * uDetail;
  if (uFlagsC.x > 0.5 && k >= 2) {
    float tx = x * (30.0 - 10.0 * (fk - 2.0));
    float th = hash12(vec2(floor(tx), fk + uSeedF));
    float tri = 1.0 - abs(fract(tx) - 0.5) * 2.0;
    h += (0.02 + 0.025 * th) * tri * step(0.15, th) * (1.0 + 0.6 * (fk - 2.0));
  }
  return h;
}

vec3 layerColor(int k, vec2 L, float h, vec3 hor) {
  float fk = float(k);
  float depth = 1.0 - fk / 3.0;
  vec3 base = mix(uPal[0], uPal[2], depth * 0.8);
  vec4 o = field(L * vec2(3.0, 5.0) + fk * 4.1);
  vec3 c = base * (0.86 + 0.14 * tanh(o.y));
  if (uFlagsB.x > 0.5) {
    float capLine = 0.03 + 0.03 * fbm(L * 18.0 + fk);
    float cap = smoothstep(capLine, capLine * 0.5, h - L.y) * smoothstep(uScene.x + 0.15, uScene.x + 0.25, h);
    c = mix(c, mix(uPal[4], vec3(1.0), 0.5), cap * 0.9);
  }
  float below = h - L.y;
  float mist = smoothstep(0.0, 0.25 + 0.2 * uFlagsB.z, below) * (0.2 + 0.45 * uFlagsB.z) * (k == 3 ? 0.4 : 1.0);
  float fog = depth * (0.35 + 0.35 * uFlagsB.z);
  return mix(c, hor, clamp(fog + mist * (1.0 - fog), 0.0, 1.0));
}

vec3 sky(vec2 L, vec3 hor, float px) {
  float t = clamp((L.y - uScene.x) / (1.0 - uScene.x), 0.0, 1.0);
  vec3 top = mix(uPal[1], uPal[0], 0.35);
  vec3 c = mix(hor, top, pow(t, 0.6));
  float night = uFlagsC.y;

  if (uFlagsA.w > 0.5) c += stars(L * 1.2, px) * smoothstep(0.0, 0.35, t) * (night > 0.5 ? 1.0 : 0.5);

  if (uFlagsB.y > 0.5) {
    vec4 ao = field(vec2(L.x * 1.3, 7.0));
    float cy = uScene.x + 0.42 + 0.12 * tanh(ao.x);
    float dy = L.y - cy;
    float curtain = dy > 0.0 ? exp(-dy * 4.0) : exp(-dy * dy * 500.0);
    float rays = 0.45 + 0.55 * vnoise(vec2(L.x * 45.0 + ao.y * 3.0, 0.5));
    vec3 acol = mix(pal(0.72), pal(1.0), smoothstep(0.0, 0.3, dy));
    c += acol * curtain * rays * 0.9;
  }

  if (uFlagsA.y > 0.5) {
    float d = length(L - uScene.yz);
    c += pal(1.0) * exp(-d * 3.5) * 0.9 * uGlow;
    float disc = smoothstep(uScene.w + px, uScene.w - px, d);
    vec3 sunCol = mix(uPal[4], vec3(1.0), 0.35);
    if (uStyle == ST_NEON) {
      sunCol = mix(pal(0.6), pal(1.0), smoothstep(uScene.z - uScene.w, uScene.z + uScene.w, L.y));
      float band = (uScene.z - L.y) / uScene.w;
      if (band > 0.0) disc *= step(band * 0.6, fract(band * 4.0));
    }
    c = mix(c, sunCol, disc);
  } else if (uFlagsA.z > 0.5) {
    float d = length(L - uScene.yz);
    float r = uScene.w * 0.8;
    c += vec3(0.75, 0.8, 0.95) * exp(-d * 6.0) * 0.35;
    float disc = smoothstep(r + px, r - px, d);
    float crater = fbm((L - uScene.yz) / r * 2.5 + uSeedF);
    c = mix(c, vec3(0.93, 0.93, 0.88) * (0.8 + 0.25 * crater), disc);
  }

  if (uFlagsB.w > 0.5) {
    vec4 o = field(vec2(L.x * 0.9, L.y * 2.6) + 11.0);
    float cd = smoothstep(0.1, 1.3, o.z + 0.5 * o.w) * smoothstep(uScene.x + 0.05, uScene.x + 0.35, L.y);
    vec3 cc = mix(uPal[3], uPal[4], 0.5 + 0.5 * tanh(o.y)) * (night > 0.5 ? 0.45 : 1.0);
    c = mix(c, cc, cd * 0.75);
  }
  return c;
}

vec3 neonGround(vec2 L, float px) {
  float d = uScene.x - L.y + 0.004;
  float z = 0.35 / d;
  vec2 g = vec2(L.x * z * 5.0, z * 2.0 + uTime * 2.0);
  vec2 f = abs(fract(g) - 0.5);
  float wz = px * 0.7 / (d * d) * 1.5;
  float wx = px * z * 5.0 * 1.5;
  float line = max(smoothstep(0.5 - wx, 0.5, f.x), smoothstep(0.5 - wz, 0.5, f.y));
  line = mix(line, 0.12, smoothstep(0.15, 0.45, max(wx, wz)));
  vec3 base = uPal[0] * 0.4 + uPal[1] * 0.3 * smoothstep(0.25, 0.0, d);
  return base + pal(0.7) * line * 1.2;
}

vec3 sceneAbove(vec2 L, vec3 hor, float px) {
  bool neon = uStyle == ST_NEON;
  if (neon && uFlagsA.x < 0.5 && L.y < uScene.x) return neonGround(L, px);
  for (int k = 3; k >= 0; k--) {
    if (neon && k == 3) continue;
    float h = ridgeH(L.x, k);
    if (uFlagsA.x > 0.5 || neon) h = max(h, uScene.x + 0.003);
    if (L.y < h) {
      if (neon) {
        float fk = float(k);
        return uPal[0] * 0.35 + pal(0.75 + 0.08 * fk) * exp(-(h - L.y) / (px * 2.5 + 0.003)) * 1.4;
      }
      return layerColor(k, L, h, hor);
    }
  }
  return sky(L, hor, px);
}

vec3 landscape(vec2 uv, float px) {
  vec2 L = vec2((uv.x - 0.5) * uView.x / uView.y, uv.y);
  vec3 hor = uStyle == ST_NEON ? mix(uPal[1], uPal[2], 0.55) : mix(uPal[3], uPal[4], 0.35);
  bool water = uFlagsA.x > 0.5 && L.y < uScene.x;
  vec2 P = L;
  float depthW = 0.0;
  if (water) {
    depthW = (uScene.x - L.y) / uScene.x;
    float wob = vnoise(vec2(L.x * 4.0, L.y * 160.0 / (0.3 + depthW))) - 0.5;
    P = vec2(L.x + wob * 0.02 * depthW, 2.0 * uScene.x - L.y + wob * 0.004);
  }
  vec3 c = sceneAbove(P, hor, px);
  if (water) {
    vec3 wc = mix(uPal[1], uPal[2], 0.5);
    c = mix(c * 0.8, wc, 0.2 + 0.35 * depthW);
    if (uFlagsA.y > 0.5 || uFlagsA.z > 0.5) {
      float gx = abs(L.x - uScene.y);
      float glit = step(0.78, vnoise(vec2(L.x * 60.0, L.y * 300.0))) * exp(-gx * 8.0 / (0.4 + depthW));
      c += pal(1.0) * glit * 0.6;
    }
    if (uStyle == ST_NEON) c += neonGround(L, px) * 0.6;
  }
  return c;
}

// ---------- 風格 ----------
vec2 brushJitter(vec2 s) {
  float a = uStyle == ST_OIL ? 0.006 : 0.004;
  vec2 j1 = vec2(vnoise(s * 28.0 + uSeedF), vnoise(s * 28.0 + 41.0 + uSeedF)) - 0.5;
  vec2 j2 = vec2(vnoise(s * 120.0), vnoise(s * 120.0 + 9.0)) - 0.5;
  return j1 * a * 2.0 + j2 * a * 0.6;
}

float hatch(vec2 s, vec2 dir, float period, float dark, float thresh) {
  if (dark < thresh) return 0.0;
  float wob = (vnoise(s * 0.02 + dir * 13.0) - 0.5) * period * 0.8;
  float v = (dot(s, dir) + wob) / period;
  float d = abs(fract(v) - 0.5) * period;
  float w = 0.35 + 0.9 * (dark - thresh) / (1.0 - thresh);
  return (1.0 - smoothstep(w, w + 1.0, d)) * smoothstep(thresh, thresh + 0.1, dark);
}

vec3 quantPal(vec3 c) {
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 9; i++) {
    int j = i / 2;
    vec3 p = (i % 2 == 0) ? uPal[j] : mix(uPal[j], uPal[min(j + 1, 4)], 0.5);
    vec3 e = c - p;
    float d = dot(e, e);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

vec3 shadeAt(vec2 frag) {
  vec2 uv = frag / uView;
  if (uComp == 2) return landscape(uv, 1.0 / uView.y);
  vec2 p = (uv * 2.0 - 1.0) * uAspect * uZoom;
  float px = 2.0 * uAspect.y * uZoom / uView.y;
  if (uComp == 1) return mandala(p);
  if (uComp == 3) return cosmos(p, px);
  if (uComp == 4) return marble(p);
  return abstractArt(p);
}

vec3 post(vec3 c, vec2 frag, float shortSide) {
  vec2 uv = frag / uView;
  vec2 s = frag / shortSide;
  if (uStyle == ST_WATERCOLOR) {
    float paper = fbm(s * 90.0 + uSeedF);
    float gran = vnoise(s * 400.0);
    c = mix(c, vec3(1.0), 0.12);
    c *= 0.92 + 0.1 * paper;
    c -= (gran - 0.5) * 0.05 * (1.0 - c);
    c = mix(c, floor(c * 7.0 + 0.5) / 7.0, 0.35);
  } else if (uStyle == ST_OIL) {
    float ang = vnoise(s * 6.0 + uSeedF) * 6.2831853;
    vec2 dir = vec2(cos(ang), sin(ang));
    float stroke = vnoise(vec2(dot(s, dir) * 260.0, dot(s, vec2(-dir.y, dir.x)) * 18.0));
    c *= 0.9 + 0.16 * stroke;
  } else if (uStyle == ST_SKETCH) {
    float dark = 1.0 - smoothstep(0.05, 0.95, luma(c));
    float period = max(3.0, shortSide / 170.0);
    float ink = max(max(hatch(frag, vec2(0.7071, 0.7071), period, dark, 0.15),
                        hatch(frag, vec2(0.7071, -0.7071), period, dark, 0.45)),
                    hatch(frag, vec2(1.0, 0.0), period * 0.8, dark, 0.7));
    vec3 paper = vec3(0.97, 0.955, 0.93) * (0.96 + 0.04 * vnoise(s * 60.0));
    c = paper * (1.0 - 0.85 * ink);
  } else if (uStyle == ST_MONO) {
    c = vec3(smoothstep(0.02, 0.98, luma(c)));
  } else if (uStyle == ST_VINTAGE) {
    c = mix(c, vec3(1.07, 0.74, 0.43) * luma(c), 0.7);
    c = c * 0.85 + vec3(0.08, 0.06, 0.04);
  }

  c = mix(vec3(luma(c)), c, uSat);
  c = uDark >= 0.0 ? c * (1.0 - uDark * 0.6) : mix(c, vec3(1.0), -uDark * 0.5);
  vec2 dv = uv - 0.5;
  c *= 1.0 - uVignette * dot(dv, dv) * 1.6;

  if (uStyle == ST_PIXEL) return quantPal(clamp(c, 0.0, 1.0));
  c += (hash12(frag + uSeedF * 13.0) - 0.5) * uGrain;
  c += (hash12(frag * 1.37 + 7.0) - 0.5) / 255.0;
  return clamp(c, 0.0, 1.0);
}

void main() {
  float shortSide = min(uView.x, uView.y);
  vec2 frag0 = gl_FragCoord.xy;
  if (uStyle == ST_PIXEL) {
    float cell = shortSide / uPixelGrid;
    frag0 = (floor(frag0 / cell) + 0.5) * cell;
  }
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    if (j >= uSS) break;
    for (int i = 0; i < 4; i++) {
      if (i >= uSS) break;
      vec2 frag = frag0 + (vec2(float(i), float(j)) + 0.5) / float(uSS) - 0.5;
      if (uStyle == ST_WATERCOLOR || uStyle == ST_OIL) frag += brushJitter(frag / shortSide) * shortSide;
      acc += shadeAt(frag);
    }
  }
  vec3 c = acc / float(uSS * uSS);
  outColor = vec4(post(c, frag0, shortSide), 1.0);
}
`;
