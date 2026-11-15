/* So‘nggi yomg‘ir tomchisi — to‘liq 3D animatsion film (o‘z WebGL2 dvigateli, tashqi kutubxonalarsiz) */
(function () {
"use strict";
// =====================================================================
//  SO‘NGGI YOMG‘IR TOMCHISI — o‘z WebGL2 dvigatelida yaratilgan 3D multfilm
//  00 · Matematika, tasodifiy sonlar, shovqin, easing va kalit-kadrlar
// =====================================================================
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smoother = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = t => Math.pow(clamp(t, 0, 1), 3);
const linear = t => clamp(t, 0, 1);
const ramp = (t, a, b) => smoother((t - a) / (b - a));
const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; }
function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
function fbm2(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
// silliq "qo‘l kamera" shovqini
function shake(t, seed, freq) { return vnoise1(t * freq + seed * 17.3) * 0.6 + vnoise1(t * freq * 2.3 + seed * 5.1) * 0.4; }

// ---------- vektorlar (oddiy massivlar) ----------
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};
function hex(h) { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function srgb(h) { return hex(h).map(c => Math.pow(c, 2.2)); } // chiziqli rang

// ---------- 4x4 matritsalar (ustun bo‘yicha) ----------
const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = M4.ident();
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
  },
  lookAt(e, c, up) {
    const z = V.norm(V.sub(e, c)), x = V.norm(V.cross(up, z)), y = V.cross(z, x), m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -V.dot(x, e); m[13] = -V.dot(y, e); m[14] = -V.dot(z, e); m[15] = 1; return m;
  },
  trs(p, q, s) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const m = new Float32Array(16);
    m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
    m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
    m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m;
  },
  fromBasis(X, Y, Z, P) {
    const m = new Float32Array(16);
    m.set([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, P[0], P[1], P[2], 1]); return m;
  },
  xform(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  xdir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = det ? 1 / det : 0; for (let i = 0; i < 16; i++) inv[i] *= det; return inv;
  },
  normalMat(m) { // inverse-transpose 3x3
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1, s = 1 / det;
    return new Float32Array([A * s, -(b * i - c * h) * s, (b * f - c * e) * s, B * s, (a * i - c * g) * s, -(a * f - c * d) * s, C * s, -(a * h - b * g) * s, (a * e - b * d) * s]);
  },
};
// ---------- kvaternionlar ----------
const Q = {
  ident: () => [0, 0, 0, 1],
  axis(ax, an) { const s = Math.sin(an / 2), n = V.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(an / 2)]; },
  mul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  },
  // yaw (Y), keyin pitch (X), keyin roll (Z)
  euler(pitch, yaw, roll) { return Q.mul(Q.mul(Q.axis([0, 1, 0], yaw), Q.axis([1, 0, 0], pitch)), Q.axis([0, 0, 1], roll)); },
};

// ---------- kalit-kadr treklari ----------
// keys: [[t, qiymat, easing?], ...]; qiymat son yoki massiv
class Track {
  constructor(keys) { this.k = keys.slice().sort((a, b) => a[0] - b[0]); }
  at(t) {
    const k = this.k; if (!k.length) return 0;
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
    let i = 0; while (i < k.length - 1 && k[i + 1][0] < t) i++;
    const a = k[i], b = k[i + 1], e = b[2] || smoother, u = e((t - a[0]) / (b[0] - a[0] || 1));
    if (Array.isArray(a[1])) return a[1].map((v, j) => lerp(v, b[1][j], u));
    return lerp(a[1], b[1], u);
  }
}
const T = keys => new Track(keys);
// Catmull-Rom yo‘l (xz nuqtalar, vaqt bilan)
class PathTrack {
  constructor(keys) { this.k = keys; } // [[t,[x,z]],...]
  at(t) {
    const k = this.k; if (t <= k[0][0]) return k[0][1].slice(); if (t >= k[k.length - 1][0]) return k[k.length - 1][1].slice();
    let i = 0; while (i < k.length - 1 && k[i + 1][0] < t) i++;
    const p0 = k[Math.max(0, i - 1)][1], p1 = k[i][1], p2 = k[i + 1][1], p3 = k[Math.min(k.length - 1, i + 2)][1];
    const e = k[i + 1][2] || smoother;
    const u = e((t - k[i][0]) / (k[i + 1][0] - k[i][0]));
    const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
  }
}

// =====================================================================
//  01 · WebGL2 renderer: PBR-ga yaqin yorug‘lik, mo‘yna qatlamlari,
//       quyosh soyasi, osmon, zarrachalar, bloom, DOF, rang gradatsiyasi
// =====================================================================
const GLSL_COMMON = `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s*1.14; }
`;

const VS_MAIN = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in vec4 aAux; layout(location=4) in vec2 aUV;
uniform mat4 uModel, uVP, uLightVP; uniform mat3 uNM;
uniform float uTime, uShell, uFurLen; uniform vec3 uWind; uniform vec4 uSway;
out vec3 vW; out vec3 vN; out vec3 vC; out vec4 vA; out vec2 vUV; out vec4 vLS; out vec3 vObj;
void main(){
  vec4 w = uModel*vec4(aPos,1.0);
  vec3 n = normalize(uNM*aNrm);
  if(uShell>0.0){
    float L = uFurLen*aAux.y;
    w.xyz += n*L*uShell;
    float g = uShell*uShell;
    w.xyz += (uWind*0.3 + vec3(0.0,-0.2,0.0))*L*g;
  }
  float s = aAux.x;
  if(s>0.0){
    float ph = uTime*uSway.y + w.x*0.9 + w.z*0.6;
    float gust = 0.65+0.35*sin(ph) + 0.25*sin(ph*2.7+1.3);
    w.xz += uWind.xz*s*uSway.x*gust;
    w.x += s*uSway.z*sin(ph*1.7); w.z += s*uSway.z*cos(ph*1.3);
  }
  vW=w.xyz; vN=n; vC=aCol; vA=aAux; vUV=aUV; vLS=uLightVP*vec4(w.xyz+n*0.003,1.0); vObj=aPos;
  gl_Position = uVP*w;
}`;

const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec3 vC; in vec4 vA; in vec2 vUV; in vec4 vLS; in vec3 vObj;
uniform vec3 uCamPos, uSunDir, uSunCol, uSkyAmb, uGndAmb, uRimCol, uFogCol, uSunFogCol, uSkyZen, uSkyHor;
uniform float uFogDen, uTime, uShell, uFurDensity, uEmis, uGlossMul, uShadowOn, uRimMul, uWarmSSS;
uniform vec3 uTint; uniform vec4 uMix; uniform int uMode;
uniform sampler2DShadow uShadow;
uniform vec4 uWet[4]; uniform vec4 uMeadow; uniform vec3 uWaterCol; uniform float uWaterMurk;
uniform vec3 uRippleDir;
out vec4 o;
${GLSL_COMMON}
float shadowAt(vec3 N){
  if(uShadowOn<0.5) return 1.0;
  vec3 p = vLS.xyz/vLS.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float b = 0.0009 + 0.0015*(1.0-abs(dot(N,uSunDir)));
  float s=0.0; vec2 tx = vec2(1.0/2048.0)*1.6;
  s += texture(uShadow, vec3(p.xy, p.z-b));
  s += texture(uShadow, vec3(p.xy+vec2( tx.x, tx.y*0.4), p.z-b));
  s += texture(uShadow, vec3(p.xy+vec2(-tx.x*0.4, tx.y), p.z-b));
  s += texture(uShadow, vec3(p.xy+vec2(-tx.x,-tx.y*0.4), p.z-b));
  s += texture(uShadow, vec3(p.xy+vec2( tx.x*0.4,-tx.y), p.z-b));
  return s/5.0;
}
vec3 skyCol(vec3 d){
  float h = clamp(d.y,0.0,1.0);
  vec3 c = mix(uSkyHor, uSkyZen, pow(h,0.55));
  float sd = max(dot(d,uSunDir),0.0);
  c += uSunFogCol*pow(sd,6.0)*0.5 + uSunCol*pow(sd,400.0)*4.0;
  return c;
}
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 V = normalize(uCamPos - vW);
  vec3 base = vC*uTint; base = mix(base, uMix.rgb, uMix.a);
  float gloss = vA.z*uGlossMul;
  float fur = vA.y;
  float ao = 1.0;
  // ---- mo‘yna qatlamlari (shell fur) ----
  if(uShell>0.0){
    if(fur<0.05) discard;
    vec2 g = vUV*uFurDensity; vec2 c=floor(g); vec2 f=fract(g)-0.5;
    float h = hash12(c);
    vec2 off = (vec2(hash12(c+3.17),hash12(c+7.71))-0.5)*0.45;
    float d = length(f-off);
    float hl = 0.45+0.55*h;
    if(uShell>hl) discard;
    float rad = 0.62*(1.0-uShell/hl)+0.08;
    if(d>rad) discard;
    ao = 0.55+0.6*uShell;
    base *= 0.92+0.22*(h-0.5);
  } else if(fur>0.0){ ao = mix(1.0,0.5,fur); }
  // ---- qum (terrain) ----
  if(uMode==1){
    vec2 xz = vW.xz;
    float dc = length(vW-uCamPos);
    float fade = 1.0-smoothstep(6.0,40.0,dc);
    vec2 rd = uRippleDir.xy;
    float warp = vnoise(xz*0.9)*5.5;
    float ph = dot(xz, rd)*26.0 + warp;
    float rip = sin(ph);
    vec2 grad = rd*cos(ph)*0.10*fade;
    N = normalize(N + vec3(grad.x,0.0,grad.y));
    float big = vnoise(xz*0.06)*0.7+vnoise(xz*0.23)*0.3;
    base *= 0.90 + 0.16*big + 0.05*rip*fade;
    // nam qum dog‘lari
    float wet=0.0;
    for(int i=0;i<4;i++){ vec4 w=uWet[i]; if(w.w<=0.0) continue; float d=length(xz-w.xy);
      float edge = w.z*(0.85+0.25*vnoise(xz*2.0+float(i)));
      wet = max(wet, w.w*(1.0-smoothstep(edge*0.55,edge,d))); }
    base = mix(base, base*vec3(0.50,0.44,0.40), wet); gloss = max(gloss, wet*0.55);
    // o‘tloq hududi
    float md = length(xz-uMeadow.xy);
    float m = 1.0-smoothstep(uMeadow.z*0.55, uMeadow.z, md + vnoise(xz*0.3)*3.0);
    vec3 lush = vec3(0.10,0.42,0.06)*(0.8+0.4*vnoise(xz*0.7));
    vec3 dead = vec3(0.20,0.20,0.13)*(0.8+0.3*vnoise(xz*0.7));
    base = mix(base, mix(lush, dead, uMeadow.w), m);
    // yaltirash (qum zarralari)
    float sp = hash12(floor(xz*90.0));
    float glint = step(0.985, sp)*fade;
    vec3 Hh = normalize(uSunDir+V);
    base += uSunCol*glint*pow(max(dot(N,Hh),0.0),20.0)*0.8;
  }
  // ---- suv ----
  if(uMode==2){
    vec2 q = vW.xz*9.0; float t=uTime;
    vec3 wn = vec3(0.045*sin(q.x*1.3+t*1.9)+0.03*sin(q.y*2.1-t*1.4+q.x*0.7),
                   1.0, 0.045*cos(q.y*1.5+t*1.7)+0.03*cos(q.x*1.9+t*1.1));
    N = normalize(wn);
    float fr = 0.03 + 0.97*pow(1.0-max(dot(N,V),0.0),5.0);
    vec3 R = reflect(-V,N);
    vec3 refl = skyCol(normalize(vec3(R.x,abs(R.y),R.z)));
    vec3 Hh = normalize(uSunDir+V);
    vec3 deep = uWaterCol*(uSkyAmb*0.6+uSunCol*0.25);
    vec3 col = mix(deep, refl*vec3(0.7,0.82,0.95), mix(fr*0.85,0.15,uWaterMurk));
    col += uSunCol*pow(max(dot(N,Hh),0.0),300.0)*3.0*(1.0-uWaterMurk*0.8);
    float d=length(vW-uCamPos); float fg=1.0-exp(-d*uFogDen);
    col = mix(col,uFogCol,fg); if(any(isnan(col))) col=vec3(0.0); o = vec4(max(col,vec3(0.0)), d/100.0); return;
  }
  // ---- yoritish ----
  float sh = shadowAt(N);
  float ndl = dot(N,uSunDir);
  float wrap = 0.3 + 0.25*fur;
  float diff = clamp((ndl+wrap)/(1.0+wrap),0.0,1.0);
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y*0.5+0.5);
  vec3 col = base*(amb*ao + uSunCol*diff*sh*mix(1.0,ao,0.5));
  // issiq "teri ostidan" yorug‘lik (mo‘yna chekkasi)
  float term = smoothstep(-0.35,0.15,ndl)*(1.0-smoothstep(0.15,0.7,ndl));
  col += base*uSunCol*term*uWarmSSS*vec3(1.0,0.45,0.25)*(0.25+fur);
  // yaltiroqlik
  if(gloss>0.0){
    vec3 Hh = normalize(uSunDir+V);
    float pw = mix(10.0,400.0,clamp(gloss,0.0,1.0));
    float spec = pow(max(dot(N,Hh),0.0),pw)*(pw+8.0)/30.0*gloss;
    float fr = 0.04+0.96*pow(1.0-max(dot(N,V),0.0),5.0);
    col += uSunCol*spec*sh*0.5;
    vec3 R = reflect(-V,N);
    col += skyCol(normalize(vec3(R.x,abs(R.y)+0.05,R.z)))*fr*gloss*0.35;
  }
  // kontur yorug‘ligi
  float rim = pow(1.0-max(dot(N,V),0.0),3.0);
  col += uRimCol*rim*(0.35+0.55*fur)*uRimMul*ao;
  col += base*vA.w*uEmis;
  // tuman
  float d = length(vW-uCamPos);
  float fg = 1.0-exp(-d*uFogDen);
  float sa = pow(max(dot(-V,uSunDir),0.0),8.0);
  col = mix(col, mix(uFogCol,uSunFogCol,sa), fg);
  if(any(isnan(col))||any(isinf(col))) col = vec3(0.0);
  o = vec4(max(col,vec3(0.0)), d/100.0);
}`;

const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=3) in vec4 aAux;
uniform mat4 uModel, uLightVP; uniform float uTime; uniform vec3 uWind; uniform vec4 uSway;
void main(){ vec4 w=uModel*vec4(aPos,1.0);
  float s=aAux.x; if(s>0.0){ float ph=uTime*uSway.y+w.x*0.9+w.z*0.6; w.xz+=uWind.xz*s*uSway.x*(0.65+0.35*sin(ph)); }
  gl_Position=uLightVP*w; }`;
const FS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1); }`;

const VS_FULL = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vUv; void main(){ vec2 p=P[gl_VertexID]; vUv=p*0.5+0.5; gl_Position=vec4(p,0.0,1.0); }`;

const FS_SKY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform mat4 uInvVP; uniform vec3 uCamPos, uSunDir, uSunCol, uSkyZen, uSkyHor, uSunFogCol, uMoonDir, uCloudCol;
uniform float uStars, uClouds, uTime, uSunSize, uOvercast;
${GLSL_COMMON}
void main(){
  vec4 a = uInvVP*vec4(vUv*2.0-1.0, 1.0, 1.0); vec3 d = normalize(a.xyz/a.w - uCamPos);
  float h = clamp(d.y,0.0,1.0);
  vec3 c = mix(uSkyHor, uSkyZen, pow(h,0.5));
  c = mix(c, uSkyHor*0.85, (1.0-smoothstep(-0.25,0.02,d.y))*0.6);
  float sd = max(dot(d,uSunDir),0.0);
  c += uSunFogCol*(pow(sd,5.0)*0.55 + pow(sd,40.0)*0.6);
  c += uSunCol*smoothstep(1.0-uSunSize, 1.0-uSunSize*0.6, sd)*6.0*(1.0-uOvercast);
  // yulduzlar
  if(uStars>0.0){
    vec2 sp = vec2(atan(d.z,d.x)*120.0, asin(clamp(d.y,-1.0,1.0))*120.0);
    vec2 cell = floor(sp); float r = hash12(cell);
    vec2 f = fract(sp)-0.5 - (vec2(hash12(cell+1.3),hash12(cell+4.1))-0.5)*0.6;
    float st = step(0.965,r)*smoothstep(0.16,0.0,length(f))*(0.5+0.5*sin(uTime*(1.0+r*4.0)+r*40.0));
    c += vec3(0.85,0.9,1.0)*st*uStars*2.2*smoothstep(0.0,0.25,d.y);
    // Somon yo‘li
    float mw = fbm(vec2(atan(d.z,d.x)*3.0, d.y*6.0))*smoothstep(0.35,0.0,abs(d.y-0.45+0.3*d.x));
    c += vec3(0.25,0.3,0.45)*mw*uStars*0.25;
    // oy
    float md = max(dot(d,uMoonDir),0.0);
    c += vec3(0.9,0.92,1.0)*(smoothstep(0.99955,0.9997,md)*3.0 + pow(md,200.0)*0.25)*uStars;
  }
  // bulutlar
  if(uClouds>0.0 && d.y>0.0){
    vec2 cp = d.xz/(d.y+0.08)*1.2 + vec2(uTime*0.01,0.0);
    float cl = smoothstep(0.45,0.85, fbm(cp*0.8)+0.25*uOvercast);
    vec3 cc = uCloudCol*(0.75+0.5*pow(sd,4.0));
    c = mix(c, cc, cl*uClouds*smoothstep(0.0,0.2,d.y));
  }
  o = vec4(c, 10.0);
}`;

const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in vec2 aSz;
uniform mat4 uVP; uniform vec3 uCamPos; uniform float uScale;
out vec4 vCol; out float vKind;
void main(){ vec4 p = uVP*vec4(aPos,1.0); gl_Position=p;
  float d = max(0.05, length(aPos-uCamPos));
  gl_PointSize = clamp(aSz.x*uScale/d, 1.0, 160.0); vCol=aCol; vKind=aSz.y; vCol.a *= smoothstep(0.12,0.45,d);
  if(gl_PointSize<1.5) vCol.a*=gl_PointSize/1.5; }`;
const FS_PART = `#version 300 es
precision highp float; in vec4 vCol; in float vKind; out vec4 o;
void main(){ vec2 p = gl_PointCoord*2.0-1.0; float a;
  if(vKind>1.5){ // tomchi shakli (yaltiroq)
    vec2 q = vec2(p.x, p.y*0.85 + 0.15); float r = length(q) + max(0.0,-q.y)*abs(q.x)*0.0;
    float drop = 1.0-smoothstep(0.55,0.75, length(vec2(q.x*(1.0+max(0.0,-q.y)*1.3), q.y)));
    float hl = smoothstep(0.25,0.0,length(p-vec2(-0.2,0.25)));
    a = drop; o = vec4(vCol.rgb*(0.7+1.6*hl), vCol.a*a); return;
  }
  float d = length(p); a = vKind>0.5 ? exp(-d*d*5.0)*(1.0-smoothstep(0.75,1.0,d)) : 1.0-smoothstep(0.4,1.0,d);
  o = vec4(vCol.rgb, vCol.a*a); }`;

const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){ vec4 s = texture(uTex,vUv+uTexel*vec2(-1,-1))+texture(uTex,vUv+uTexel*vec2(1,-1))+texture(uTex,vUv+uTexel*vec2(-1,1))+texture(uTex,vUv+uTexel*vec2(1,1));
  o = s*0.25; if(any(isnan(o))||any(isinf(o))) o=vec4(0.0,0.0,0.0,1.0); o.rgb=min(max(o.rgb,vec3(0.0)),vec3(64.0)); }`;
const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main(){ vec4 s = texture(uTex,vUv)*0.227;
  s += (texture(uTex,vUv+uDir*1.385)+texture(uTex,vUv-uDir*1.385))*0.316;
  s += (texture(uTex,vUv+uDir*3.231)+texture(uTex,vUv-uDir*3.231))*0.070; o=s; }`;

const FS_COMP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBlur, uBlur2, uPrev, uText;
uniform float uExposure, uSat, uContrast, uBloom, uBloomThr, uVig, uGrain, uTime, uFocus, uAperture, uHaze, uMixPrev, uTextA, uFade;
uniform vec3 uTintG, uLift;
${GLSL_COMMON}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
void main(){
  vec2 uv = vUv;
  if(uHaze>0.0){ float hz = (1.0-smoothstep(0.35,0.62,uv.y))*smoothstep(0.15,0.45,uv.y);
    uv.x += (vnoise(vec2(uv.y*90.0, uTime*3.0))-0.5)*0.0028*uHaze*hz;
    uv.y += (vnoise(vec2(uv.x*60.0+7.0, uTime*2.3))-0.5)*0.0018*uHaze*hz; }
  vec4 s = texture(uScene, uv);
  vec4 b = texture(uBlur, uv); vec4 b2 = texture(uBlur2, uv);
  float dep = s.a*100.0;
  float coc = clamp(abs(dep-uFocus)/max(dep,0.05)*uAperture, 0.0, 1.0);
  if(s.a>9.0) coc = clamp(uAperture*0.8,0.0,1.0);
  vec3 c = mix(s.rgb, b.rgb, smoothstep(0.0,0.55,coc));
  c = mix(c, b2.rgb, smoothstep(0.55,1.0,coc));
  float lb = dot(b.rgb, vec3(0.2126,0.7152,0.0722)), lb2 = dot(b2.rgb, vec3(0.2126,0.7152,0.0722));
  vec3 br = b.rgb*max(lb-uBloomThr,0.0)/max(lb,1e-4)*0.6 + b2.rgb*max(lb2-uBloomThr*0.85,0.0)/max(lb2,1e-4);
  c += br*uBloom;
  c *= uExposure; c *= uTintG;
  c = aces(c);
  c = pow(c, vec3(1.0/2.2));
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(vec3(l), c, uSat);
  c = (c-0.5)*uContrast+0.5;
  c += uLift*(1.0-c);
  vec2 q = vUv-0.5; q.x*=1.6;
  c *= 1.0 - uVig*smoothstep(0.25,0.95,length(q));
  c += (hash12(vUv*vec2(1920.0,1080.0)+fract(uTime*7.31)*100.0)-0.5)*uGrain;
  if(uMixPrev>0.0) c = mix(texture(uPrev,vUv).rgb, c, uMixPrev);
  c = mix(c, vec3(0.0), uFade);
  vec4 tx = texture(uText, vec2(vUv.x,1.0-vUv.y));
  c = mix(c, tx.rgb, tx.a*uTextA);
  o = vec4(clamp(c,0.0,1.0),1.0);
}`;

class Renderer {
  constructor(canvas, W, H) {
    this.W = W; this.H = H; this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, depth: false });
    if (!gl) throw new Error('WebGL2 mavjud emas');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.progMain = this.prog(VS_MAIN, FS_MAIN);
    this.progDepth = this.prog(VS_DEPTH, FS_DEPTH);
    this.progSky = this.prog(VS_FULL, FS_SKY);
    this.progPart = this.prog(VS_PART, FS_PART);
    this.progDown = this.prog(VS_FULL, FS_DOWN);
    this.progBlur = this.prog(VS_FULL, FS_BLUR);
    this.progComp = this.prog(VS_FULL, FS_COMP);
    this.emptyVAO = gl.createVertexArray();
    const qs = new URLSearchParams(location.search);
    this.samples = Math.min(qs.get('msaa') == null ? 4 : +qs.get('msaa'), gl.getParameter(gl.MAX_SAMPLES));
    this.makeTargets();
    // soya xaritasi
    this.SH = 2048;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SH, this.SH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    // matn teksturasi
    this.textTex = this.tex2D(4, 4, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    // zarrachalar buferi
    this.partVAO = gl.createVertexArray(); this.partBuf = gl.createBuffer(); this.partCap = 0;
    gl.bindVertexArray(this.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
    gl.bindVertexArray(null);
  }
  prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader xatosi: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link xatosi: ' + gl.getProgramInfoLog(p));
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace('[0]', ''); p.u[nm] = gl.getUniformLocation(p, info.name); }
    return p;
  }
  tex2D(w, h, ifmt, fmt, type) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  fbo(tex) { const gl = this.gl, f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; }
  makeTargets() {
    const gl = this.gl, W = this.W, H = this.H;
    const IF = this.floatOK ? gl.RGBA16F : gl.RGBA8, TY = this.floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.msFB = gl.createFramebuffer();
    this.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, IF, W, H);
    this.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFB);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDepth);
    this.sceneTex = this.tex2D(W, H, IF, gl.RGBA, TY); this.sceneFB = this.fbo(this.sceneTex);
    const mk = (w, h) => { const t = this.tex2D(w, h, IF, gl.RGBA, TY); return { t, f: this.fbo(t), w, h }; };
    this.half = mk(W >> 1, H >> 1); this.q1 = mk(W >> 2, H >> 2); this.q2 = mk(W >> 2, H >> 2);
    this.e1 = mk(W >> 3, H >> 3); this.e2 = mk(W >> 3, H >> 3);
    this.prevTex = this.tex2D(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); this.prevFB = this.fbo(this.prevTex);
  }
  setText(canvas2d) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
  }
  // ------------------------------------------------------------------
  mesh(data, dynamic) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const m = { vao, bufs: [], count: data.idx.length, dynamic };
    const put = (loc, arr, size) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); m.bufs[loc] = b;
    };
    put(0, data.pos, 3); put(1, data.nrm, 3); put(2, data.col, 3); put(3, data.aux, 4); put(4, data.uv, 2);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = data.pos.length / 3 > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(data.idx) : new Uint16Array(data.idx), gl.STATIC_DRAW);
    m.itype = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; m.ib = ib;
    gl.bindVertexArray(null); return m;
  }
  updateMesh(m, data) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.bufs[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.bufs[1]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.nrm);
    if (data.col) { gl.bindBuffer(gl.ARRAY_BUFFER, m.bufs[2]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.col); }
  }
  // ------------------------------------------------------------------
  envUniforms(p, env, cam) {
    const gl = this.gl, u = p.u;
    const s3 = (n, v) => u[n] && gl.uniform3fv(u[n], v);
    const s1 = (n, v) => u[n] && gl.uniform1f(u[n], v);
    s3('uCamPos', cam.pos); s3('uSunDir', env.sunDir); s3('uSunCol', env.sunCol); s3('uSkyAmb', env.skyAmb); s3('uGndAmb', env.gndAmb);
    s3('uRimCol', env.rimCol); s3('uFogCol', env.fogCol); s3('uSunFogCol', env.sunFogCol); s3('uSkyZen', env.skyZen); s3('uSkyHor', env.skyHor);
    s1('uFogDen', env.fogDen); s1('uTime', env.time); s1('uWarmSSS', env.warmSSS);
    s3('uWind', env.wind); s3('uRippleDir', env.rippleDir);
    if (u.uWet) gl.uniform4fv(u.uWet, env.wet);
    if (u.uMeadow) gl.uniform4fv(u.uMeadow, env.meadow);
    if (u.uLightVP) gl.uniformMatrix4fv(u.uLightVP, false, this.lightVP);
  }
  drawItems(p, items, depthOnly) {
    const gl = this.gl, u = p.u;
    for (const it of items) {
      const mt = it.mat;
      if (depthOnly && !mt.cast) continue;
      gl.uniformMatrix4fv(u.uModel, false, it.world);
      gl.uniform4fv(u.uSway, mt.sway || [0, 1, 0, 0]);
      gl.bindVertexArray(it.mesh.vao);
      if (depthOnly) { gl.drawElements(gl.TRIANGLES, it.mesh.count, it.mesh.itype, 0); continue; }
      gl.uniformMatrix3fv(u.uNM, false, it.nm);
      gl.uniform3fv(u.uTint, mt.tint || [1, 1, 1]);
      gl.uniform4fv(u.uMix, mt.mix || [0, 0, 0, 0]);
      gl.uniform1i(u.uMode, mt.mode || 0);
      gl.uniform1f(u.uEmis, mt.emis || 0);
      gl.uniform1f(u.uGlossMul, mt.gloss == null ? 1 : mt.gloss);
      gl.uniform1f(u.uRimMul, mt.rim == null ? 1 : mt.rim);
      gl.uniform1f(u.uShadowOn, mt.recv === false ? 0 : 1);
      if (mt.mode === 2) { gl.uniform3fv(u.uWaterCol, mt.water || [0.05, 0.2, 0.25]); gl.uniform1f(u.uWaterMurk, mt.murk || 0); }
      gl.uniform1f(u.uShell, 0); gl.uniform1f(u.uFurLen, 0);
      gl.drawElements(gl.TRIANGLES, it.mesh.count, it.mesh.itype, 0);
      if (mt.shells && this.shellCount > 0) {
        gl.uniform1f(u.uFurLen, mt.furLen); gl.uniform1f(u.uFurDensity, mt.furDensity || 900);
        const n = Math.min(mt.shells, this.shellCount);
        for (let i = 1; i <= n; i++) { gl.uniform1f(u.uShell, i / n); gl.drawElements(gl.TRIANGLES, it.mesh.count, it.mesh.itype, 0); }
      }
    }
  }
  // asosiy kadr chizish: frame = {cam, env, items, parts, post}
  renderScene(fr) {
    const gl = this.gl, W = this.W, H = this.H, env = fr.env, cam = fr.cam;
    this.shellCount = fr.shells == null ? 6 : fr.shells;
    // --- soya ---
    const c = env.shadowCenter, sd = env.sunDir, R = env.shadowRadius || 4;
    const lpos = V.add(c, V.mul(sd, 30));
    const up = Math.abs(sd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    this.lightVP = M4.mul(M4.ortho(-R, R, -R, R, 1, 70), M4.lookAt(lpos, c, up));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB); gl.viewport(0, 0, this.SH, this.SH);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
    gl.useProgram(this.progDepth);
    gl.uniformMatrix4fv(this.progDepth.u.uLightVP, false, this.lightVP);
    gl.uniform1f(this.progDepth.u.uTime, env.time); gl.uniform3fv(this.progDepth.u.uWind, env.wind);
    this.drawItems(this.progDepth, fr.items, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    // --- asosiy sahna ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFB); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 10); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const VP = M4.mul(cam.proj, cam.view);
    // osmon
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const ps = this.progSky; gl.useProgram(ps);
    gl.uniformMatrix4fv(ps.u.uInvVP, false, M4.invert(M4.mul(cam.proj, M4.mul(cam.view, M4.ident()))));
    this.envUniforms(ps, env, cam);
    gl.uniform3fv(ps.u.uMoonDir, env.moonDir); gl.uniform3fv(ps.u.uCloudCol, env.cloudCol);
    gl.uniform1f(ps.u.uStars, env.stars); gl.uniform1f(ps.u.uClouds, env.clouds); gl.uniform1f(ps.u.uSunSize, env.sunSize); gl.uniform1f(ps.u.uOvercast, env.overcast);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // jismlar
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    const pm = this.progMain; gl.useProgram(pm);
    gl.uniformMatrix4fv(pm.u.uVP, false, VP);
    this.envUniforms(pm, env, cam);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(pm.u.uShadow, 0);
    this.drawItems(pm, fr.items, false);
    // zarrachalar
    if (fr.parts && fr.parts.length) {
      gl.depthMask(false); gl.enable(gl.BLEND);
      const pp = this.progPart; gl.useProgram(pp);
      gl.uniformMatrix4fv(pp.u.uVP, false, VP); gl.uniform3fv(pp.u.uCamPos, cam.pos);
      gl.uniform1f(pp.u.uScale, H / (2 * Math.tan(cam.fov / 2)));
      gl.bindVertexArray(this.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
      for (const batch of fr.parts) {
        if (!batch.n) continue;
        if (batch.add) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
        else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        if (batch.data.byteLength > this.partCap) { this.partCap = batch.data.byteLength * 2; gl.bufferData(gl.ARRAY_BUFFER, this.partCap, gl.DYNAMIC_DRAW); }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, batch.n * 9);
        gl.drawArrays(gl.POINTS, 0, batch.n);
      }
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
    // --- MSAA hal qilish ---
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sceneFB);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    // --- xiralashtirish zanjiri ---
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(this.emptyVAO);
    const pass = (prog, src, dst, setup) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h); gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(prog.u.uTex, 0); setup && setup(prog);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    pass(this.progDown, this.sceneTex, this.half, p => gl.uniform2f(p.u.uTexel, 0.5 / W, 0.5 / H));
    pass(this.progDown, this.half.t, this.q1, p => gl.uniform2f(p.u.uTexel, 1 / W, 1 / H));
    pass(this.progBlur, this.q1.t, this.q2, p => gl.uniform2f(p.u.uDir, 4 / W, 0));
    pass(this.progBlur, this.q2.t, this.q1, p => gl.uniform2f(p.u.uDir, 0, 4 / H));
    pass(this.progDown, this.q1.t, this.e1, p => gl.uniform2f(p.u.uTexel, 2 / W, 2 / H));
    pass(this.progBlur, this.e1.t, this.e2, p => gl.uniform2f(p.u.uDir, 8 / W, 0));
    pass(this.progBlur, this.e2.t, this.e1, p => gl.uniform2f(p.u.uDir, 0, 8 / H));
    pass(this.progBlur, this.e1.t, this.e2, p => gl.uniform2f(p.u.uDir, 14 / W, 0));
    pass(this.progBlur, this.e2.t, this.e1, p => gl.uniform2f(p.u.uDir, 0, 14 / H));
  }
  composite(post, toPrev, mixPrev) {
    const gl = this.gl, p = this.progComp, u = p.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, toPrev ? this.prevFB : null); gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(p); gl.bindVertexArray(this.emptyVAO);
    const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u[name], unit); };
    bind(0, this.sceneTex, 'uScene'); bind(1, this.q1.t, 'uBlur'); bind(2, this.e1.t, 'uBlur2'); bind(3, toPrev ? this.textTex : this.prevTex, 'uPrev'); bind(4, this.textTex, 'uText');
    gl.uniform1f(u.uExposure, post.exposure); gl.uniform1f(u.uSat, post.sat); gl.uniform1f(u.uContrast, post.contrast);
    gl.uniform1f(u.uBloom, post.bloom); gl.uniform1f(u.uBloomThr, post.bloomThr); gl.uniform1f(u.uVig, post.vig);
    gl.uniform1f(u.uGrain, post.grain); gl.uniform1f(u.uTime, post.time); gl.uniform1f(u.uFocus, post.focus);
    gl.uniform1f(u.uAperture, post.aperture); gl.uniform1f(u.uHaze, post.haze);
    gl.uniform3fv(u.uTintG, post.tint); gl.uniform3fv(u.uLift, post.lift);
    gl.uniform1f(u.uMixPrev, toPrev ? 0 : (mixPrev || 0)); gl.uniform1f(u.uTextA, toPrev ? 0 : (post.textA || 0));
    gl.uniform1f(u.uFade, post.fade || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// =====================================================================
//  02 · Geometriya quruvchilari: haykaltaroshlik sferalari, trubalar,
//       sirtlar, birlashtirish
// =====================================================================
function computeNormals(pos, idx, nrm) {
  nrm.fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
}
// (nu+1)x(nv+1) to‘r; fn(u,v) -> {p:[..], c:[..], a:[..], t:[..]}
function gridGeo(nu, nv, fn, opt = {}) {
  const N = (nu + 1) * (nv + 1);
  const g = { pos: new Float32Array(N * 3), nrm: new Float32Array(N * 3), col: new Float32Array(N * 3), aux: new Float32Array(N * 4), uv: new Float32Array(N * 2), idx: [] };
  g.nu = nu; g.nv = nv; g.fn = fn; g.opt = opt;
  fillGrid(g);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (opt.flip) g.idx.push(a, b, c, b, d, c); else g.idx.push(a, c, b, b, c, d);
  }
  finishNormals(g);
  return g;
}
function fillGrid(g) {
  const { nu, nv, fn } = g;
  let k = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    const r = fn(i / nu, j / nv);
    g.pos[k * 3] = r.p[0]; g.pos[k * 3 + 1] = r.p[1]; g.pos[k * 3 + 2] = r.p[2];
    const c = r.c || [1, 1, 1]; g.col[k * 3] = c[0]; g.col[k * 3 + 1] = c[1]; g.col[k * 3 + 2] = c[2];
    const a = r.a || [0, 0, 0, 0]; g.aux.set(a, k * 4);
    const t = r.t || [i / nu, j / nv]; g.uv[k * 2] = t[0]; g.uv[k * 2 + 1] = t[1];
  }
}
function finishNormals(g) {
  computeNormals(g.pos, g.idx, g.nrm);
  const { nu, nv, opt } = g, n = g.nrm;
  const avg = list => {
    let x = 0, y = 0, z = 0; for (const k of list) { x += n[k * 3]; y += n[k * 3 + 1]; z += n[k * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1; for (const k of list) { n[k * 3] = x / l; n[k * 3 + 1] = y / l; n[k * 3 + 2] = z / l; }
  };
  if (opt.wrapU) for (let j = 0; j <= nv; j++) avg([j * (nu + 1), j * (nu + 1) + nu]);
  if (opt.poles) { const top = [], bot = []; for (let i = 0; i <= nu; i++) { top.push(i); bot.push(nv * (nu + 1) + i); } avg(top); avg(bot); }
}
function regrid(g) { fillGrid(g); finishNormals(g); return g; }

// Haykal sfera: qutblar Y o‘qida, oldi +Z. fn(d, u, v) -> {p,c,a}
function sculptGeo(nu, nv, fn, furScale = 0.1) {
  return gridGeo(nu, nv, (u, v) => {
    const th = u * TAU, ph = v * Math.PI;
    const d = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
    const r = fn(d, u, v);
    r.t = [u * TAU * furScale, v * Math.PI * furScale];
    return r;
  }, { wrapU: true, poles: true });
}
// Truba: path(v) -> {p, r, c, a}; parallel-transport ramkalar
function tubeGeo(nu, nv, path, furScale = 0.05, rx = 1, ry = 1) {
  const pts = [], frames = [];
  for (let j = 0; j <= nv; j++) pts.push(path(j / nv));
  let prevN = null;
  for (let j = 0; j <= nv; j++) {
    const a = pts[Math.max(0, j - 1)].p, b = pts[Math.min(nv, j + 1)].p;
    const T0 = V.norm(V.sub(b, a));
    let N0;
    if (!prevN) { const ref = Math.abs(T0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; N0 = V.norm(V.cross(V.cross(T0, ref), T0)); }
    else { N0 = V.norm(V.sub(prevN, V.mul(T0, V.dot(prevN, T0)))); }
    prevN = N0; frames.push([T0, N0, V.cross(T0, N0)]);
  }
  let len = 0; const L = [0]; for (let j = 1; j <= nv; j++) { len += V.dist(pts[j].p, pts[j - 1].p); L.push(len); }
  return gridGeo(nu, nv, (u, v) => {
    const j = Math.round(v * nv), P = pts[j], [Tn, Nn, Bn] = frames[j], th = u * TAU;
    const rr = P.r, cx = Math.cos(th) * rr * (P.rx || rx), cy = Math.sin(th) * rr * (P.ry || ry);
    const p = V.add(P.p, V.add(V.mul(Nn, cy), V.mul(Bn, cx)));
    const c = typeof P.c === 'function' ? P.c(th) : P.c;
    return { p, c, a: P.a, t: [u * TAU * Math.max(rr, 0.004) * furScale * 20, L[j] * furScale * 20] };
  }, { wrapU: true, poles: true });
}
// Suyak: +Y bo‘ylab uzunligi len, radius profili rf(v)
function boneGeo(len, rf, col, aux, nu = 18, nv = 14) {
  return tubeGeo(nu, nv, v => {
    const y = lerp(-rf(0) * 0.9, len + rf(1) * 0.9, v);
    const vv = clamp(y / len, 0, 1);
    let r = rf(vv);
    if (y < 0) r = Math.sqrt(Math.max(0, r * r - y * y)); if (y > len) r = Math.sqrt(Math.max(0, r * r - (y - len) ** 2));
    return { p: [0, y, 0], r, c: typeof col === 'function' ? col(vv) : col, a: aux };
  });
}
function xformGeo(g, m) {
  const out = { pos: new Float32Array(g.pos.length), nrm: new Float32Array(g.nrm.length), col: g.col.slice(), aux: g.aux.slice(), uv: g.uv.slice(), idx: g.idx.slice() };
  const nm = M4.normalMat(m);
  for (let i = 0; i < g.pos.length; i += 3) {
    const p = M4.xform(m, [g.pos[i], g.pos[i + 1], g.pos[i + 2]]); out.pos.set(p, i);
    const n = g.nrm, x = n[i], y = n[i + 1], z = n[i + 2];
    const nn = V.norm([nm[0] * x + nm[3] * y + nm[6] * z, nm[1] * x + nm[4] * y + nm[7] * z, nm[2] * x + nm[5] * y + nm[8] * z]);
    out.nrm.set(nn, i);
  }
  return out;
}
function mergeGeo(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.pos.length / 3; ni += g.idx.length; }
  const o = { pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), col: new Float32Array(nv * 3), aux: new Float32Array(nv * 4), uv: new Float32Array(nv * 2), idx: new Array(ni) };
  let vo = 0, io = 0;
  for (const g of list) {
    o.pos.set(g.pos, vo * 3); o.nrm.set(g.nrm, vo * 3); o.col.set(g.col, vo * 3); o.aux.set(g.aux, vo * 4); o.uv.set(g.uv, vo * 2);
    for (let i = 0; i < g.idx.length; i++) o.idx[io + i] = g.idx[i] + vo;
    vo += g.pos.length / 3; io += g.idx.length;
  }
  return o;
}
function tintGeo(g, fn) { // vertex ranglarini o‘zgartirish
  for (let i = 0; i < g.col.length / 3; i++) {
    const c = fn([g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]], [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]], i);
    g.col.set(c, i * 3);
  }
  return g;
}
const ellipsoid = (rx, ry, rz, col, aux, nu = 24, nv = 16) => sculptGeo(nu, nv, d => ({ p: [d[0] * rx, d[1] * ry, d[2] * rz], c: col, a: aux }), Math.max(rx, ry, rz));
const gauss3 = (d, c, r) => Math.exp(-((d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 + (d[2] - c[2]) ** 2) / (r * r));

// =====================================================================
//  03 · Dunyo: sahro relyefi, quruq daraxt, buloq, toshlar, pana,
//       uzoqdagi "o‘tloq", zarrachalar (qum, chang, tomchilar)
// =====================================================================
const OASIS = [0, 0];
const POOL = [0.42, 0.18];
const FLOWER_POS = [-0.18, 0.36];
const TREE_POS = [0.95, -0.55];
const MEADOW = [52, -30];
const RIDGE = [24, -13];
const POND = [MEADOW[0] - 3.5, MEADOW[1] + 2.5];

function duneRaw(x, z) {
  const w = vnoise2(x * 0.008 + 3.1, z * 0.008 - 1.7) * 22;
  const u = (x + w) * 0.05, v = (z * 0.55 + w * 0.5) * 0.05;
  const r1 = 1 - Math.abs(vnoise2(u, v * 0.45));
  const r2 = 1 - Math.abs(vnoise2(u * 2.3 + 5.2, v * 1.1 + 3.3));
  return 6.0 * Math.pow(r1, 2.4) + 1.4 * Math.pow(r2, 2.2) + 5 * fbm2(x * 0.004 + 9, z * 0.004, 3);
}
const BASE0 = duneRaw(0, 0);
const MEADOW_H = 0.6;
function H(x, z) {
  let h = duneRaw(x, z) - BASE0;
  const ro = Math.hypot(x - OASIS[0], z - OASIS[1]);
  const fo = smooth((ro - 2.6) / 12);
  h = h * fo + (1 - fo) * 0.04 * Math.sin(x * 1.3) * Math.cos(z * 1.1);
  h -= 0.075 * Math.exp(-((x - POOL[0]) ** 2 + (z - POOL[1]) ** 2) / 0.22);
  const rm = Math.hypot(x - MEADOW[0], z - MEADOW[1]);
  const fm = smooth((rm - 15) / 14);
  h = h * fm + (1 - fm) * (MEADOW_H + 0.08 * Math.sin(x * 0.7) * Math.cos(z * 0.5));
  h -= 0.35 * Math.exp(-((x - POND[0]) ** 2 + (z - POND[1]) ** 2) / 6);
  return h;
}
function normalH(x, z) { const e = 0.05; return V.norm([H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)]); }
const gp = (x, z, dy = 0) => [x, H(x, z) + dy, z];

// ---------- relyef to‘ri (radial, markazda zich) ----------
function buildTerrain() {
  const NR = 250, NA = 340;
  const rOf = i => 0.16 * i + 0.62 * (Math.exp(0.03 * i) - 1);
  const sandA = srgb('#E2A35E'), sandB = srgb('#BF7A40'), sandC = srgb('#EDBB7C');
  return gridGeo(NA, NR, (u, v) => {
    const i = v * NR, r = rOf(i), a = u * TAU;
    const x = OASIS[0] + Math.cos(a) * r, z = OASIS[1] + Math.sin(a) * r, y = H(x, z);
    const n = fbm2(x * 0.05, z * 0.05, 3);
    const crest = clamp((y - (duneRaw(x + 3, z) - BASE0 + duneRaw(x - 3, z) - BASE0) * 0.5) * 0.6 + 0.5, 0, 1);
    let c = V.lerp(sandB, sandA, clamp(0.55 + n * 0.6, 0, 1));
    c = V.lerp(c, sandC, crest * 0.35);
    return { p: [x, y, z], c, a: [0, 0, 0.05, 0], t: [x, z] };
  }, { wrapU: true, flip: true });
}

// ---------- quruq daraxt ----------
function buildTree() {
  const rnd = mulberry32(77);
  const parts = [];
  const bark = srgb('#6E5A48'), bark2 = srgb('#9C8670');
  function branch(p0, dir, len, r0, depth) {
    const pts = []; let p = p0.slice(), d = dir.slice(); const seg = 8;
    for (let i = 0; i <= seg; i++) {
      pts.push(p.slice());
      d = V.norm(V.add(d, [(rnd() - 0.5) * 0.35, (rnd() - 0.35) * 0.15, (rnd() - 0.5) * 0.35]));
      p = V.add(p, V.mul(d, len / seg));
    }
    const g = tubeGeo(10, seg * 2, v => {
      const f = v * seg, i = Math.min(seg - 1, Math.floor(f)), w = f - i;
      const P = V.lerp(pts[i], pts[i + 1], w);
      const r = r0 * (1 - 0.75 * v) * (v > 0.97 ? Math.sqrt(Math.max(0, (1 - v) / 0.03)) : 1);
      return { p: P, r: Math.max(r, 0.0005), c: V.lerp(bark, bark2, 0.3 + 0.5 * rnd()), a: [0, 0, 0.12, 0] };
    });
    parts.push(g);
    if (depth > 0) {
      const nb = depth >= 2 ? 3 : 2;
      for (let k = 0; k < nb; k++) {
        const at = 0.45 + 0.5 * rnd(), j = Math.floor(at * seg);
        const nd = V.norm(V.add(d, [(rnd() - 0.5) * 1.6, 0.3 + rnd() * 0.5, (rnd() - 0.5) * 1.6]));
        branch(pts[j], nd, len * (0.5 + 0.2 * rnd()), r0 * (1 - 0.75 * at) * 0.8, depth - 1);
      }
    }
  }
  const base = gp(TREE_POS[0], TREE_POS[1], -0.05);
  branch(base, V.norm([-0.25, 1, 0.12]), 1.15, 0.07, 3);
  // ildizlar
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.3; branch(V.add(base, [0, 0.08, 0]), V.norm([Math.cos(a), -0.35, Math.sin(a)]), 0.45, 0.04, 0); }
  return mergeGeo(parts);
}
// ---------- toshlar ----------
function rockGeo(seed, s, col) {
  const r = mulberry32(seed), o = [r() * 9, r() * 9, r() * 9];
  return sculptGeo(20, 14, d => {
    const n = vnoise2(d[0] * 2.2 + o[0], d[1] * 2.2 + d[2] * 1.7 + o[1]) * 0.22 + vnoise2(d[0] * 5 + o[2], d[2] * 5) * 0.06;
    const k = 1 + n;
    return { p: [d[0] * s * k, d[1] * s * 0.62 * k, d[2] * s * k * 0.9], c: V.mul(col, 0.85 + 0.3 * (n + 0.2)), a: [0, 0, 0.1, 0] };
  });
}
function buildRocks() {
  const parts = [], col = srgb('#A08468'), col2 = srgb('#8A7258');
  const ring = [[0.95, 0.3, 0.13], [0.62, -0.18, 0.09], [0.05, -0.12, 0.07], [0.88, 0.62, 0.08], [1.25, -0.15, 0.11], [-0.55, -0.4, 0.06]];
  ring.forEach(([x, z, s], i) => parts.push(xformGeo(rockGeo(10 + i, s, i % 2 ? col : col2), M4.trs(gp(x, z, -s * 0.15), Q.euler(0, i * 1.3, 0), [1, 1, 1]))));
  // sahroda sochilgan toshlar va quruq butalar (masshtab uchun)
  const rnd = mulberry32(555);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * TAU, d = 6 + Math.pow(rnd(), 0.7) * 140;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - MEADOW[0], z - MEADOW[1]) < 20) continue;
    const s = 0.05 + rnd() * 0.25;
    parts.push(xformGeo(rockGeo(100 + i, s, V.mul(col, 0.8 + rnd() * 0.3)), M4.trs(gp(x, z, -s * 0.2), Q.euler(0, rnd() * 6, 0), [1, 1, 1])));
  }
  return mergeGeo(parts);
}
function buildShrubs() {
  const rnd = mulberry32(909), parts = [];
  const dry = srgb('#A88A55'), dry2 = srgb('#7A6440');
  const tuft = (x, z, s) => {
    for (let k = 0; k < 9; k++) {
      const a = rnd() * TAU, l = s * (0.6 + rnd() * 0.6), lean = 0.3 + rnd() * 0.5;
      const dir = V.norm([Math.cos(a) * lean, 1, Math.sin(a) * lean]);
      const b = gp(x, z);
      parts.push(tubeGeo(4, 4, v => ({ p: V.add(b, V.add(V.mul(dir, v * l), [0, -v * v * l * 0.25, 0])), r: 0.006 * s * 4 * (1 - v) + 0.0004, c: V.lerp(dry2, dry, v), a: [v * 0.6, 0, 0.05, 0] })));
    }
  };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * TAU, d = 3.5 + Math.pow(rnd(), 0.8) * 90;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - MEADOW[0], z - MEADOW[1]) < 22) continue;
    tuft(x, z, 0.12 + rnd() * 0.25);
  }
  tuft(-1.1, -0.7, 0.18); tuft(1.6, 0.6, 0.14); tuft(-0.9, 1.3, 0.12);
  return mergeGeo(parts);
}
// ---------- suv yuzasi (doira) ----------
function discGeo(r, segs = 48, rings = 6, col = [1, 1, 1], wob = 0.08, seed = 1) {
  return gridGeo(segs, rings, (u, v) => {
    const a = u * TAU, rr = r * v * (1 + wob * vnoise1(u * 6 + seed) * v);
    return { p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], c: col, a: [0, 0, 0.9, 0] };
  }, { wrapU: true, flip: true });
}
// ---------- barg-kosa (suv tashish uchun) ----------
function leafCupGeo() {
  const g1 = srgb('#6F8A3A'), g2 = srgb('#A3A24E'), br = srgb('#8A6A3A');
  return gridGeo(12, 16, (u, v) => {
    const x = (u - 0.5) * 2, len = 0.15, w = 0.055 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.8);
    const px = x * w, py = (x * x) * 0.035 + Math.sin(v * Math.PI) * 0.012, pz = (v - 0.5) * len;
    const vein = Math.exp(-x * x * 60);
    return { p: [px, py, pz], c: V.lerp(V.lerp(g1, g2, v), br, vein * 0.4 + Math.abs(x) * 0.25), a: [0, 0, 0.35, 0] };
  });
}
// ---------- tayoqchalar (pana) ----------
function stickGeo(len, r, seed) {
  const rnd = mulberry32(seed), c1 = srgb('#7B5E40'), c2 = srgb('#A9875E');
  const bend = [(rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06];
  return tubeGeo(7, 10, v => ({ p: V.add([0, v * len, 0], V.mul(bend, Math.sin(v * Math.PI))), r: r * (1 - 0.4 * v) * (v < 0.03 || v > 0.97 ? 0.4 : 1), c: V.lerp(c1, c2, rnd()), a: [0, 0, 0.1, 0] }));
}
function frondGeo() { // quruq palma bargi - pana tomi
  const c1 = srgb('#B89A5E'), c2 = srgb('#8E7448');
  return gridGeo(18, 10, (u, v) => {
    const x = (u - 0.5) * 2;
    const comb = 0.75 + 0.25 * Math.abs(Math.sin(u * 22));
    return { p: [x * 0.17 * comb * (1 - 0.3 * v), -x * x * 0.03 - v * v * 0.04, v * 0.3], c: V.lerp(c1, c2, (Math.sin(u * 22) + 1) * 0.3 + v * 0.3), a: [0.15 * v, 0, 0.08, 0] };
  });
}

// ---------- "o‘tloq" (uzoqdan yam-yashil, yaqindan sun’iy) ----------
function buildMeadow() {
  const rnd = mulberry32(4242), grass = [];
  const gA = srgb('#7FBF3A'), gB = srgb('#3E8A22');
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * 15.5;
    const x = MEADOW[0] + Math.cos(a) * d, z = MEADOW[1] + Math.sin(a) * d;
    const pondD = Math.hypot(x - POND[0], z - POND[1]);
    if (pondD < 3.2) continue;
    const h = (0.12 + rnd() * 0.22) * (1 - 0.4 * smooth((d - 12) / 4)), w = 0.012 + rnd() * 0.01, ang = rnd() * TAU, lean = (rnd() - 0.5) * 0.5;
    const b = gp(x, z, -0.01), ca = Math.cos(ang), sa = Math.sin(ang);
    const col = V.lerp(gB, gA, rnd());
    grass.push(gridGeo(1, 3, (u, v) => {
      const ww = w * (1 - v) * (u - 0.5) * 2;
      const off = lean * v * v * h;
      return { p: [b[0] + ca * ww + sa * off, b[1] + v * h, b[2] - sa * ww + ca * off], c: V.mul(col, 0.55 + 0.45 * v), a: [v * v * 1.0, 0, 0.15, 0] };
    }));
  }
  const grassG = mergeGeo(grass);
  // daraxtlar
  const trees = [];
  const trunk = srgb('#5E4632'), leaf = srgb('#4E9A2E');
  const spots = [[-9, -7, 1.0], [-5, -11, 0.8], [7, -10, 1.2], [11, -3, 0.9], [-12, 2, 1.1], [2, -13, 0.85], [12, 6, 0.8]];
  spots.forEach(([dx, dz, s], k) => {
    const b = gp(MEADOW[0] + dx, MEADOW[1] + dz, -0.05);
    trees.push(tubeGeo(8, 8, v => ({ p: V.add(b, [Math.sin(v * 2) * 0.1 * s, v * 2.2 * s, 0]), r: 0.09 * s * (1 - 0.5 * v), c: trunk, a: [0, 0, 0.05, 0] })));
    for (let j = 0; j < 5; j++) {
      const o = [(rnd() - 0.5) * 1.4 * s, (2.2 + rnd() * 0.9) * s, (rnd() - 0.5) * 1.4 * s];
      const rs = (0.7 + rnd() * 0.5) * s, sd = 300 + k * 10 + j;
      const r2 = mulberry32(sd), oo = [r2() * 9, r2() * 9];
      trees.push(xformGeo(sculptGeo(18, 12, d => { const n = 1 + vnoise2(d[0] * 3 + oo[0], d[1] * 3 + d[2] * 2 + oo[1]) * 0.18; return { p: [d[0] * n, d[1] * n * 0.8, d[2] * n], c: V.mul(leaf, 0.7 + 0.4 * (d[1] * 0.5 + 0.5)), a: [0.05, 0, 0.1, 0] }; }), M4.trs(V.add(b, o), Q.ident(), [rs, rs, rs])));
    }
  });
  // sun’iy gullar - bir xil, qator-qator, qimirlamaydi
  const fakes = [];
  const pet = [srgb('#FF2D55'), srgb('#FFD400'), srgb('#FF5FA2')];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const x = MEADOW[0] - 9 + c * 1.6 + (r % 2) * 0.8, z = MEADOW[1] + 5.5 - r * 1.5;
    if (Math.hypot(x - POND[0], z - POND[1]) < 3.6) continue;
    if (Math.hypot(x - 45.4, z + 26.7) < 0.9) continue;
    const b = gp(x, z), col = pet[(r + c) % 3];
    const tilt = (r * 7 + c * 3) % 5 === 0 ? 0.5 : 0;
    const m = M4.trs(b, Q.euler(tilt, c * 0.7, tilt * 0.6), [1, 1, 1]);
    fakes.push(xformGeo(fakeFlowerGeo(col), m));
  }
  // ko‘lmak atrofidagi axlat (shishalar/plastik)
  const junk = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, d = 2.5 + rnd() * 1.6;
    const x = POND[0] + Math.cos(a) * d, z = POND[1] + Math.sin(a) * d;
    const col = [srgb('#6B7C86'), srgb('#9AA7A0'), srgb('#5A6A4A')][i % 3];
    junk.push(xformGeo(boneGeo(0.12, v => 0.025 * (v > 0.8 ? 0.5 : 1), col, [0, 0, 0.7, 0], 10, 6), M4.trs(gp(x, z, 0.02), Q.euler(Math.PI / 2, rnd() * 6, 0), [1, 1, 1])));
  }
  return { grass: grassG, trees: mergeGeo(trees), fakes: mergeGeo(fakes), junk: mergeGeo(junk) };
}
function fakeFlowerGeo(col) {
  const stem = boneGeo(0.32, () => 0.005, srgb('#22A83A'), [0, 0, 0.9, 0], 6, 6);
  const parts = [stem];
  for (let k = 0; k < 5; k++) {
    const p = gridGeo(4, 4, (u, v) => ({ p: [(u - 0.5) * 0.05 * Math.sin(Math.PI * (0.2 + v * 0.8)), 0, v * 0.06], c: col, a: [0, 0, 0.95, 0] }));
    parts.push(xformGeo(p, M4.trs([0, 0.32, 0], Q.euler(-0.15, k * TAU / 5, 0), [1, 1, 1])));
  }
  parts.push(xformGeo(ellipsoid(0.014, 0.01, 0.014, srgb('#FFFFFF'), [0, 0, 0.95, 0], 10, 8), M4.trs([0, 0.325, 0], Q.ident(), [1, 1, 1])));
  return mergeGeo(parts);
}

// ---------- zarrachalar ----------
class PartBatch {
  constructor(cap, add) { this.data = new Float32Array(cap * 9); this.n = 0; this.cap = cap; this.add = add; }
  reset() { this.n = 0; return this; }
  push(p, c, a, size, kind = 0) {
    if (this.n >= this.cap) return; const o = this.n * 9, d = this.data;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; d[o + 6] = a; d[o + 7] = size; d[o + 8] = kind; this.n++;
  }
}
const SAND_COL = srgb('#E2A868');
// shamolda uchayotgan qum
function emitSand(b, t, center, amount, wind, storm) {
  if (amount <= 0) return;
  const N = Math.floor(900 * amount * (storm ? 2.5 : 1)), R = storm ? 3.5 : 7;
  const wl = Math.hypot(wind[0], wind[2]) || 1, wd = [wind[0] / wl, wind[2] / wl];
  const spd = 1.2 + wl * 2.2;
  for (let i = 0; i < N; i++) {
    const h1 = hash1(i * 1.37 + 0.5), h2 = hash1(i * 2.71 + 1.3), h3 = hash1(i * 4.13 + 2.9), h4 = hash1(i * 7.7 + 5.1);
    const life = 2.5 + h4 * 2;
    const ph = (t / life + h3) % 1;
    const k = Math.floor(t / life + h3);
    const ox = (hash1(i * 9.1 + k * 3.3) - 0.5) * 2 * R, oz = (hash1(i * 5.3 + k * 7.1) - 0.5) * 2 * R;
    const x = center[0] + ox + wd[0] * (ph - 0.5) * spd * life, z = center[2] + oz + wd[1] * (ph - 0.5) * spd * life;
    const hop = (storm ? 0.05 + h1 * 1.6 : 0.01 + h1 * h1 * 0.25) + Math.abs(Math.sin(ph * 9 + h2 * 6)) * 0.05;
    const y = H(x, z) + hop;
    const a = Math.sin(ph * Math.PI) * (storm ? 0.55 : 0.4) * (0.4 + h2 * 0.6);
    b.push([x, y, z], SAND_COL, a * 0.7, (storm ? 0.012 : 0.004) + h2 * 0.005, 1);
  }
  // past qatlamdagi qum "ilonlari" (yerga yopishgan oqimlar)
  const M = Math.floor(500 * amount);
  for (let i = 0; i < M; i++) {
    const h1 = hash1(i * 3.1 + 9), h2 = hash1(i * 1.9 + 4), life = 1.6 + h2;
    const ph = (t / life + h1) % 1, k = Math.floor(t / life + h1);
    const ox = (hash1(i * 2.3 + k) - 0.5) * 2 * R, oz = (hash1(i * 6.7 + k * 1.3) - 0.5) * 2 * R;
    const x = center[0] + ox + wd[0] * ph * spd * life * 0.8, z = center[2] + oz + wd[1] * ph * spd * life * 0.8;
    b.push([x, H(x, z) + 0.008, z], SAND_COL, Math.sin(ph * Math.PI) * 0.35, 0.03 + h2 * 0.03, 1);
  }
}
// havodagi chang (yorug‘lik nurida)
function emitMotes(b, t, center, amount, col) {
  if (amount <= 0) return;
  for (let i = 0; i < 160; i++) {
    const h1 = hash1(i * 1.1), h2 = hash1(i * 2.2 + 1), h3 = hash1(i * 3.3 + 2);
    const x = center[0] + (h1 - 0.5) * 3 + Math.sin(t * 0.3 + i) * 0.1, z = center[2] + (h2 - 0.5) * 3 + Math.cos(t * 0.27 + i) * 0.1;
    const y = center[1] + h3 * 1.2 + Math.sin(t * 0.2 + i * 1.7) * 0.05;
    b.push([x, y, z], col, amount * 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i)), 0.004, 1);
  }
}
// ballistik tomchi: boshlanish nuqtasi, tezlik, t0
function emitDrop(b, t, t0, p0, v0, col, size, maxLife = 2) {
  const dt = t - t0; if (dt < 0 || dt > maxLife) return null;
  const p = [p0[0] + v0[0] * dt, p0[1] + v0[1] * dt - 4.9 * dt * dt, p0[2] + v0[2] * dt];
  const g = H(p[0], p[2]); if (p[1] < g) return 'hit';
  b.push(p, col, 0.9, size, 2); return p;
}

// =====================================================================
//  04 · To‘rt oyoqli qahramon (tulki va kiyik uchun umumiy rig):
//       IK oyoqlar, qadam sikli, bosh/ko‘z nigohi, qovoqlar, qoshlar,
//       quloqlar, jag‘, til, dum, nafas, ko‘z yoshlari, mo‘yna
// =====================================================================
function ik2(A, C, a, b, pole) {
  let dv = V.sub(C, A), d = V.len(dv);
  const maxd = (a + b) * 0.999, mind = Math.abs(a - b) + 0.002;
  const dir = V.mul(dv, 1 / (d || 1)); d = clamp(d, mind, maxd);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  let perp = V.sub(pole, V.mul(dir, V.dot(pole, dir))); perp = V.norm(perp);
  const B = V.add(A, V.add(V.mul(dir, a * cosA), V.mul(perp, a * sinA)));
  const Cc = V.add(A, V.mul(dir, d));
  return [B, Cc];
}
function boneMatrix(A, B, side, len) {
  const Y0 = V.sub(B, A), L = V.len(Y0), Y = V.mul(Y0, 1 / (L || 1));
  let X = V.cross(Y, side); if (V.len(X) < 1e-4) X = V.cross(Y, [0, 0, 1]); X = V.norm(X);
  const Z = V.cross(X, Y);
  const s = len ? L / len : 1;
  return M4.fromBasis(X, V.mul(Y, s), Z, A);
}
const qrot = (q, v) => { // kvaternion bilan vektorni burish
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const qinv = q => [-q[0], -q[1], -q[2], q[3]];

class Creature {
  constructor(R, cfg) {
    this.R = R; this.cfg = cfg; const c = cfg;
    const fur = { shells: c.shells, furLen: c.furLen, furDensity: c.furDensity, gloss: 1, cast: true };
    this.mFur = fur;
    this.mFurLong = Object.assign({}, fur, { furLen: c.furLen * 1.8 });
    this.mFurShort = Object.assign({}, fur, { furLen: c.furLen * 0.5, shells: Math.max(2, c.shells - 3) });
    this.mPlain = { cast: true };
    this.mLid = Object.assign({}, fur, { furLen: c.furLen * 0.6, shells: Math.max(2, c.shells - 3), cast: false });
    this.mGloss = { cast: true, gloss: 1 };
    this.mEye = { cast: false, gloss: 1, rim: 0.2 };
    this.mCatch = { cast: false, recv: false, emis: 5, rim: 0 };
    this.mTear = { cast: false, recv: false, gloss: 1.4, emis: 0.6, tint: [0.85, 0.92, 1.0] };
    this.meshes = {};
    const M = (k, g) => (this.meshes[k] = R.mesh(g));
    M('body', c.bodyGeo()); M('head', c.headGeo()); M('snout', c.snoutGeo());
    if (c.chestGeo) M('chest', c.chestGeo());
    M('neck', c.neckGeo());
    M('earL', c.earGeo(1)); M('earR', c.earGeo(-1));
    M('eye', c.eyeGeo()); M('lidU', c.lidGeo(true)); M('lidL', c.lidGeo(false));
    M('brow', ellipsoid(c.brow[0], c.brow[1], c.brow[2], c.browCol, [0, 0.8, 0.03, 0], 12, 8));
    M('nose', c.noseGeo()); M('jaw', c.jawGeo());
    M('mouth', ellipsoid(c.jaw.r[0] * 0.85, c.jaw.r[1] * 0.9, c.jaw.r[2] * 0.85, srgb('#3A0E10'), [0, 0, 0.6, 0], 12, 8));
    M('tongue', ellipsoid(c.jaw.r[0] * 0.5, c.jaw.r[1] * 0.35, c.jaw.r[2] * 0.55, srgb('#E36B78'), [0, 0, 0.9, 0], 12, 8));
    M('legFU', boneGeo(c.legF[0], c.legFR[0], c.legColU, [0, 1, 0.04, 0]));
    M('legFL', boneGeo(c.legF[1], c.legFR[1], c.legColL, [0, 0.7, 0.04, 0]));
    M('legHU', boneGeo(c.legH[0], c.legHR[0], c.legColU, [0, 1, 0.04, 0]));
    M('legHL', boneGeo(c.legH[1], c.legHR[1], c.legColL, [0, 0.7, 0.04, 0]));
    M('paw', c.pawGeo());
    M('catch', ellipsoid(1, 1, 1, [1, 1, 1], [0, 0, 0, 1], 8, 6));
    M('tear', ellipsoid(1, 1, 1, [0.8, 0.9, 1.0], [0, 0, 1, 0.4], 12, 8));
    if (c.hornGeo) { M('hornL', c.hornGeo(1)); M('hornR', c.hornGeo(-1)); }
    this.tail = c.tailPath ? R.mesh(this.tailGeo({ wag: 0, up: 0, curl: 0, t: 0 }), true) : null;
    this.items = []; this.anchor = {};
  }
  tailGeo(s) {
    const c = this.cfg;
    return tubeGeo(14, 22, v => {
      const p = c.tailPath(v, s);
      return { p: p.p, r: c.tailR(v), c: c.tailCol(v), a: [0, 1, 0.04, 0] };
    }, 0.06);
  }
  // st — holat parametrlari (hikoya treklaridan)
  catchlights(camPos) {
    const out = [];
    if (!this._eyes) return out;
    for (const e of this._eyes) {
      if (e.lids >= 0.75) continue;
      const toCam = V.norm(V.sub(camPos, e.eyeCenter));
      let hdir = V.norm(V.add(V.add(toCam, [0, 0.55, 0]), V.mul(e.rgt, 0.25)));
      // qovoq ostida qolmasin: ko‘z lokal koordinatasida balandlikni cheklash
      const lq = e.lidQ, ld = qrot(qinv(lq), hdir);
      const edgeEl = e.openA - 0.28 - 0.12;
      if (edgeEl < -0.45) continue;
      const el = Math.asin(clamp(ld[1], -1, 1));
      if (el > edgeEl) { const hz = Math.hypot(ld[0], ld[2]) || 1; const ne = Math.max(edgeEl, -0.5); hdir = qrot(lq, [ld[0] / hz * Math.cos(ne), Math.sin(ne), ld[2] / hz * Math.cos(ne)]); }
      const cs = e.er * 0.17 * (1 + e.tears * 0.4);
      const m1 = M4.trs(V.add(e.eyeCenter, V.mul(hdir, e.er)), Q.ident(), [cs, cs, cs]);
      out.push({ mesh: this.meshes.catch, mat: this.mCatch, world: m1, nm: M4.normalMat(m1) });
      const hdir2 = V.norm(V.add(V.add(toCam, [0, -0.35, 0]), V.mul(e.rgt, -0.3)));
      const cs2 = e.er * 0.07;
      const m2 = M4.trs(V.add(e.eyeCenter, V.mul(hdir2, e.er)), Q.ident(), [cs2, cs2, cs2]);
      out.push({ mesh: this.meshes.catch, mat: this.mCatch, world: m2, nm: M4.normalMat(m2) });
    }
    return out;
  }
  update(t, st, camPos, wind) {
    const c = this.cfg, out = this.items; out.length = 0;
    const push = (mesh, mat, world) => out.push({ mesh, mat, world, nm: M4.normalMat(world) });
    const yaw = st.heading || 0;
    const fwd = [Math.sin(yaw), 0, Math.cos(yaw)], rgt = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const hop = st.hop || 0;
    const root = gp(st.pos[0], st.pos[1]);
    const qYaw = Q.axis([0, 1, 0], yaw);
    const mv = st.moving || 0, ph = st.phase || 0, gal = st.gallop || 0;
    const sit = st.sit || 0, lie = st.lie || 0, cr = st.crouch || 0, beg = st.beg || 0, tired = st.tired || 0, dig = st.dig || 0;
    // yer qiyaligi
    const sl = (H(root[0] + fwd[0] * c.bodyHalf, root[2] + fwd[2] * c.bodyHalf) - H(root[0] - fwd[0] * c.bodyHalf, root[2] - fwd[2] * c.bodyHalf)) / (2 * c.bodyHalf);
    const slope = Math.atan(sl) * (1 - lie * 0.5);
    // tana holati
    const bob = mv * (gal > 0.5 ? c.hipH * 0.12 * Math.abs(Math.sin(TAU * ph)) : c.hipH * 0.035 * Math.sin(2 * TAU * ph + 0.6));
    let hipH = c.hipH * (1 - 0.05 * tired) + bob + hop;
    hipH += sit * (c.sitHipH - c.hipH) + lie * (c.lieHipH - c.hipH) + cr * (c.hipH * -0.06) + dig * (c.hipH * -0.05);
    let pitchUp = slope + sit * c.sitPitch + beg * c.begPitch + lie * (-0.03) + cr * (-0.30) + dig * (-0.18);
    pitchUp += gal * mv * 0.12 * Math.sin(TAU * ph + 1.2);
    const roll = mv * 0.03 * Math.sin(TAU * ph) + (st.bodyRoll || 0);
    const breath = Math.sin(t * (st.breathRate || 2.2)) * (st.breathAmp == null ? 1 : st.breathAmp);
    const qT = Q.mul(qYaw, Q.mul(Q.axis([1, 0, 0], -pitchUp), Q.axis([0, 0, 1], roll)));
    const tpos = V.add(V.add(root, [0, hipH, 0]), V.add(V.mul(fwd, c.hipZ + (st.bodyShift || 0) + sit * c.sitShift), [0, 0, 0]));
    const torsoM = M4.trs(tpos, qT, [1 + breath * 0.01, 1 + breath * 0.018, 1]);
    this.torsoM = torsoM;
    const TW = p => M4.xform(torsoM, p);
    push(this.meshes.body, this.mFur, torsoM);
    if (this.meshes.chest) push(this.meshes.chest, this.mFurLong, torsoM);
    // ---- bosh: nigoh ----
    const neckBase = TW(c.neckBase);
    let lookYaw = 0, lookPitch = 0, lw = st.lookW || 0;
    if (st.look && lw > 0) {
      const dv = V.sub(st.look, neckBase);
      const lx = V.dot(dv, rgt), lz = V.dot(dv, fwd);
      lookYaw = clamp(Math.atan2(lx, lz), -1.4, 1.4); lookPitch = clamp(Math.atan2(dv[1] - c.neckLen * 0.6, Math.hypot(lx, lz)), -1.1, 0.9);
    }
    const sway = Math.sin(t * 0.9 + c.seed) * 0.03 + Math.sin(t * 0.37 + c.seed * 2) * 0.03;
    const hyaw = (st.headYaw || 0) + lw * lookYaw + sway * 0.6;
    let hp = (st.headPitch || 0) + lw * lookPitch - cr * 0.95 - lie * 0.12 - tired * 0.35 - dig * 0.75 + sway * 0.3 + mv * 0.03 * Math.sin(2 * TAU * ph);
    const el = c.neckEl + (st.neckUp || 0) - cr * 0.95 - lie * 0.55 - tired * 0.3 - dig * 0.6 + beg * 0.1 - pitchUp * 0.75 + clamp(hp, -1, 1) * 0.25;
    const ny = hyaw * 0.35;
    const nd = [Math.sin(ny) * Math.cos(el), Math.sin(el), Math.cos(ny) * Math.cos(el)];
    const pivotT = V.add(c.neckBase, V.mul(nd, c.neckLen));
    const pivot = TW(pivotT);
    const headRel = hp - pitchUp;
    const qH = Q.mul(qT, Q.mul(Q.axis([0, 1, 0], hyaw * 0.65), Q.mul(Q.axis([1, 0, 0], -headRel), Q.axis([0, 0, 1], (st.headRoll || 0) + sway * 0.4))));
    const hs = c.headScale || 1;
    const headM = M4.trs(pivot, qH, [hs, hs, hs]);
    this.headM = headM; this.headQ = qH; this.headPos = pivot;
    const HW = p => M4.xform(headM, p);
    // bo‘yin
    const neckTop = HW(c.neckTop);
    push(this.meshes.neck, this.mFur, boneMatrix(neckBase, neckTop, rgt, c.neckLen));
    push(this.meshes.head, this.mFur, headM);
    push(this.meshes.snout, this.mFur, headM);
    push(this.meshes.nose, this.mGloss, headM);
    if (this.meshes.hornL) { push(this.meshes.hornL, this.mGloss, headM); push(this.meshes.hornR, this.mGloss, headM); }
    // jag‘, til
    const jaw = clamp(st.jaw || 0, 0, 1), tongue = st.tongue || 0;
    const jawM = M4.mul(headM, M4.trs(c.jaw.pivot, Q.axis([1, 0, 0], jaw * 0.5), [1, 1, 1]));
    push(this.meshes.jaw, this.mFur, jawM);
    if (jaw > 0.02) push(this.meshes.mouth, this.mPlain, M4.mul(headM, M4.trs(c.jaw.mouthPos, Q.ident(), [1, 1, 1])));
    if (tongue > 0.02) push(this.meshes.tongue, this.mGloss, M4.mul(jawM, M4.trs([0, c.jaw.r[1] * 0.5, c.jaw.r[2] * (1.2 + tongue * 0.3)], Q.axis([1, 0, 0], 0.15 + tongue * 0.55), [1, 1, 1 + tongue * 0.3])));
    this.anchor.mouth = M4.xform(jawM, [0, 0, c.jaw.r[2] * 1.6]);
    this.anchor.nose = HW(c.nosePos);
    this.anchor.jawM = jawM;
    // quloqlar
    const eb = st.earsBack || 0, ed = st.earsDown || 0, perk = st.earsPerk || 0;
    for (const s of [1, -1]) {
      const tw = (st.earTwitch || 0) * Math.max(0, Math.sin(t * 7 + s)) * (hash1(Math.floor(t * 0.7) + s) > 0.6 ? 1 : 0);
      const q = Q.mul(Q.axis([0, 0, 1], -s * (c.earRoll + ed * 0.7)), Q.mul(Q.axis([1, 0, 0], -(c.earPitch + eb * 0.9) + perk * 0.25 - tw * 0.15), Q.axis([0, 1, 0], s * (c.earYaw + ed * 0.3))));
      const ep = [c.earPos[0] * s, c.earPos[1], c.earPos[2]];
      push(s > 0 ? this.meshes.earL : this.meshes.earR, this.mFurShort, M4.mul(headM, M4.trs(ep, q, [1, 1, 1])));
    }
    // ---- ko‘zlar ----
    const kB = Math.floor((t + c.seed) / 3.4);
    let blink = 0;
    if (!st.noBlink) for (const k of [kB - 1, kB]) {
      const bt = k * 3.4 + hash1(k * 13.1 + c.seed) * 2.0 - c.seed; const d = t - bt;
      if (d > 0 && d < 0.24) blink = Math.max(blink, d < 0.08 ? smooth(d / 0.08) : 1 - smooth((d - 0.08) / 0.16));
    }
    if (st.blinkAt) for (const bt of st.blinkAt) { const d = t - bt; if (d > 0 && d < 0.3) blink = Math.max(blink, d < 0.1 ? smooth(d / 0.1) : 1 - smooth((d - 0.1) / 0.2)); }
    const lids = clamp(Math.max(st.lids || 0, blink) - (st.wide || 0) * 0.25, -0.25, 1);
    const qHi = qinv(qH);
    const eyeT = st.eyeTarget || (st.look && lw > 0.2 ? st.look : null);
    this.anchor.eyes = [];
    for (const s of [1, -1]) {
      const ec = [c.eyePos[0] * s, c.eyePos[1], c.eyePos[2]];
      const ew = HW(ec);
      let ey = 0, ep = 0;
      if (eyeT) {
        const dl = qrot(qHi, V.sub(eyeT, ew));
        ey = clamp(Math.atan2(dl[0], dl[2]) - s * c.eyeYaw, -0.28, 0.28); ep = clamp(Math.atan2(dl[1], Math.hypot(dl[0], dl[2])), -0.25, 0.25);
      }
      ey += vnoise1(t * 1.7 + s * 3 + c.seed) * 0.03 + (st.eyeYaw || 0); ep += vnoise1(t * 1.3 + 7 + c.seed) * 0.02 + (st.eyePitch || 0);
      const eyeQ = Q.mul(Q.axis([0, 1, 0], s * c.eyeYaw + ey), Q.axis([1, 0, 0], -ep));
      const er = c.eyeR * (1 + (st.wide || 0) * 0.06);
      const eyeM = M4.mul(headM, M4.trs(ec, eyeQ, [er, er, er]));
      push(this.meshes.eye, this.mEye, eyeM);
      // qovoqlar
      const baseQ = Q.axis([0, 1, 0], s * c.eyeYaw);
      const sad = st.browSad || 0, sly = st.sly || 0;
      const openA = lerp(c.lidOpen, 0.0, clamp(lids, 0, 1)) + clamp(-lids, 0, 1) * 0.3;
      const rollU = s * (sad * 0.35 - sly * 0.25);
      const qU = Q.mul(baseQ, Q.mul(Q.axis([0, 0, 1], rollU), Q.axis([1, 0, 0], -openA)));
      const lr = c.eyeR * 1.07;
      push(this.meshes.lidU, this.mLid, M4.mul(headM, M4.trs(ec, qU, [lr, lr, lr])));
      const sq = clamp((st.squint || 0) + lids * 0.4, 0, 1);
      const qL = Q.mul(baseQ, Q.mul(Q.axis([0, 0, 1], -s * sad * 0.15), Q.axis([1, 0, 0], lerp(c.lidLowOpen, 0.05, sq))));
      push(this.meshes.lidL, this.mLid, M4.mul(headM, M4.trs(ec, qL, [lr * 1.01, lr * 1.01, lr * 1.01])));
      // qoshlar
      const bp = [c.browPos[0] * s, c.browPos[1] + (st.browUp || 0) * 0.008 + sad * 0.004, c.browPos[2]];
      const bq = Q.mul(Q.axis([0, 1, 0], s * 0.35), Q.axis([0, 0, 1], s * (sad * 0.55 - (st.browAngry || 0) * 0.5 - sly * 0.35 + 0.08)));
      push(this.meshes.brow, this.mFurShort, M4.mul(headM, M4.trs(bp, bq, [1, 1, 1])));
      // yaltiroq nuqtalar (ko‘z nuri)
      const eyeCenter = M4.xform(eyeM, [0, 0, 0]);
      this._eyes = this._eyes || []; if (s > 0) this._eyes.length = 0;
      this._eyes.push({ eyeCenter, er, lids, tears: st.tears || 0, rgt, lidQ: Q.mul(qH, baseQ), openA });
      if (camPos && lids < 0.75) {
        const toCam = V.norm(V.sub(camPos, eyeCenter));
        const hdir = V.norm(V.add(V.add(toCam, [0, 0.55, 0]), V.mul(rgt, 0.25)));
        const cp = V.add(eyeCenter, V.mul(hdir, er * 1.0));
        const cs = er * 0.17 * (1 + (st.tears || 0) * 0.4);
        push(this.meshes.catch, this.mCatch, M4.trs(cp, Q.ident(), [cs, cs, cs]));
        const hdir2 = V.norm(V.add(V.add(toCam, [0, -0.35, 0]), V.mul(rgt, -0.3)));
        const cs2 = er * 0.07;
        push(this.meshes.catch, this.mCatch, M4.trs(V.add(eyeCenter, V.mul(hdir2, er * 1.0)), Q.ident(), [cs2, cs2, cs2]));
      }
      // ko‘z yoshi pardasi
      const tr = st.tears || 0;
      if (tr > 0.02) {
        const tp = HW([ec[0], ec[1] - c.eyeR * 0.72, ec[2] + c.eyeR * 0.55]);
        const tm = M4.mul(M4.trs(tp, qH, [1, 1, 1]), M4.trs([0, 0, 0], Q.axis([0, 1, 0], s * c.eyeYaw), [c.eyeR * 0.85 * tr, c.eyeR * 0.22 * tr, c.eyeR * 0.35 * tr]));
        push(this.meshes.tear, this.mTear, tm);
      }
      this.anchor.eyes.push({ center: eyeCenter, side: s });
    }
    // dumaloq tomchilar yonoq bo‘ylab (st.tearRoll: [{side, u}])
    if (st.tearRoll) for (const tr of st.tearRoll) {
      if (tr.u <= 0 || tr.u >= 1) continue;
      const s = tr.side, e = c.eyePos;
      const P0 = [e[0] * s, e[1] - c.eyeR * 0.8, e[2] + c.eyeR * 0.5], P1 = [e[0] * s * 1.25, e[1] - c.eyeR * 2.6, e[2] - c.eyeR * 0.2], P2 = [e[0] * s * 1.1, e[1] - c.eyeR * 4.2, e[2] - c.eyeR * 0.6];
      const u = tr.u, pl = u < 0.5 ? V.lerp(P0, P1, u * 2) : V.lerp(P1, P2, (u - 0.5) * 2);
      const sz = c.eyeR * 0.28 * (0.8 + 0.4 * Math.sin(u * 3));
      push(this.meshes.tear, this.mTear, M4.trs(HW(pl), qH, [sz, sz * 1.3, sz]));
    }
    // ---- oyoqlar (IK + qadam) ----
    const stride = st.stride || c.stride;
    const legs = [
      { id: 'LF', hip: [c.shoulder[0], c.shoulder[1], c.shoulder[2]], front: true, off: gal > 0.5 ? 0.5 : 0.5 },
      { id: 'RF', hip: [-c.shoulder[0], c.shoulder[1], c.shoulder[2]], front: true, off: gal > 0.5 ? 0.62 : 0.0 },
      { id: 'LH', hip: [c.hip[0], c.hip[1], c.hip[2]], front: false, off: gal > 0.5 ? 0.0 : 0.0 },
      { id: 'RH', hip: [-c.hip[0], c.hip[1], c.hip[2]], front: false, off: gal > 0.5 ? 0.1 : 0.5 },
    ];
    this.anchor.paws = {};
    for (const L of legs) {
      const A = TW(L.hip);
      const side = Math.sign(L.hip[0]);
      const restZ = L.front ? c.footF : c.footH;
      // standart qadam (dunyo koordinatada)
      const f = ((ph + L.off) % 1 + 1) % 1;
      const stance = 0.62;
      let rel, lift = 0;
      if (f < stance) rel = 0.5 - f / stance; else { const w = (f - stance) / (1 - stance); rel = -0.5 + smoother(w); lift = Math.sin(Math.PI * w); }
      rel *= stride * stance * mv;
      lift *= mv * c.hipH * (0.18 + gal * 0.25);
      let lx = side * c.footW, lz = restZ + rel, ly = lift + hop * 0.85;
      // o‘tirish / yotish / tilanish holatlari
      if (L.front) {
        lz = lerp(lz, c.sitFootF, sit); lz = lerp(lz, c.lieFootF, lie);
        lx = lerp(lx, side * c.footW * 0.9, lie);
        if (beg > 0) { lx = lerp(lx, side * c.footW * 0.35, beg); lz = lerp(lz, c.begPaw[1], beg); ly = lerp(ly, c.begPaw[0], beg); }
        if (dig > 0) {
          const dp = (st.digPhase || 0) + (side > 0 ? 0 : 0.5), dd = dp % 1;
          lz = lerp(lz, c.footF + 0.05 - 0.07 * dd, dig); ly = lerp(ly, Math.max(0, Math.sin(dd * Math.PI)) * 0.04 * (dd > 0.5 ? 1 : 0.35), dig);
        }
        if (st.pawReach && side === st.pawReach.side) { const w = st.pawReach.w; lx = lerp(lx, st.pawReach.x, w); lz = lerp(lz, st.pawReach.z, w); ly = lerp(ly, st.pawReach.y, w); }
      } else {
        lz = lerp(lz, c.sitFootH, sit); lz = lerp(lz, c.lieFootH, lie);
        lx = lerp(lx, side * c.footW * 1.6, lie);
      }
      const tgtXZ = V.add(root, V.add(V.mul(rgt, lx), V.mul(fwd, lz)));
      const gy = H(tgtXZ[0], tgtXZ[2]);
      const pawLift = c.pawH;
      const C = [tgtXZ[0], gy + pawLift + ly, tgtXZ[2]];
      const lenU = L.front ? c.legF[0] : c.legH[0], lenL = L.front ? c.legF[1] : c.legH[1];
      const pole = L.front ? V.norm(V.add(V.mul(fwd, -1), [0, -0.2, 0])) : V.norm(V.add(V.mul(fwd, 1), [0, -0.25, 0]));
      const [Bk, Cc] = ik2(A, C, lenU, lenL, pole);
      push(L.front ? this.meshes.legFU : this.meshes.legHU, this.mFur, boneMatrix(A, Bk, rgt, 0));
      push(L.front ? this.meshes.legFL : this.meshes.legHL, this.mFurShort, boneMatrix(Bk, Cc, rgt, 0));
      const pawPitch = (L.front && beg > 0) ? -beg * 1.2 : 0;
      const pq = Q.mul(qYaw, Q.axis([1, 0, 0], pawPitch + (lift > 0 ? -0.4 * lift / (c.hipH * 0.2 + 1e-3) * 0.3 : 0)));
      const pm = M4.trs(V.add(Cc, [0, -pawLift * 0.6, 0]), pq, [1, 1, 1]);
      push(this.meshes.paw, this.mFurShort, pm);
      this.anchor.paws[L.id] = Cc;
    }
    // ---- dum ----
    if (this.tail) {
      const ts = { wag: st.tailWag || 0, up: st.tailUp || 0, curl: st.tailCurl || 0, t, wind: wind ? Math.hypot(wind[0], wind[2]) : 0, mv, ph };
      this.R.updateMesh(this.tail, this.tailGeo(ts));
      push(this.tail, this.mFurLong, torsoM);
    }
    this.anchor.root = root; this.anchor.fwd = fwd; this.anchor.rgt = rgt;
    this.anchor.chest = TW([0, 0.02, c.neckBase[2]]);
    const pf = this.anchor.paws;
    this.anchor.pawsMid = V.mul(V.add(pf.LF, pf.RF), 0.5);
    return out;
  }
}

// =====================================================================
//  05 · Qahramonlar: TULKI bolasi, KIYIK (jayron), GUL, URUG‘, NIHOL
//       Har bir qahramon bitta qat'iy konfiguratsiyadan quriladi —
//       barcha sahnalarda tashqi ko‘rinish bir xil qoladi.
// =====================================================================
const FOX_COL = {
  or: srgb('#EC7A22'), orD: srgb('#B9521A'), cream: srgb('#F5E3CC'), white: srgb('#FCF6EF'), sock: srgb('#3B2419'),
  earTip: srgb('#2B1C15'), inner: srgb('#F2BBA6'), nose: srgb('#151010'), irisIn: srgb('#C47E34'), irisOut: srgb('#5E2F12'),
  ring: srgb('#2A140A'), pupil: srgb('#0A0605'), sclera: srgb('#F4ECE6'), liner: srgb('#2A160E'),
};
function eyeGeoFn(irisIn, irisOut, ring) {
  return () => sculptGeo(36, 28, d => {
    const a = Math.acos(clamp(d[2], -1, 1)), th = Math.atan2(d[1], d[0]);
    const streak = 0.82 + 0.36 * (hash1(Math.floor((th + 4) * 18)) * 0.6 + 0.4 * hash1(Math.floor((th + 4) * 41)));
    const k = clamp((a - 0.28) / 0.38, 0, 1);
    let iris = V.mul(V.lerp(irisIn, irisOut, Math.pow(k, 0.8)), streak);
    iris = V.lerp(iris, ring, smooth((k - 0.78) / 0.22));
    let c = V.lerp(FOX_COL.pupil, iris, smooth((a - 0.26) / 0.04));
    c = V.lerp(c, FOX_COL.sclera, smooth((a - 0.66) / 0.05));
    const bulge = 1 + 0.07 * smooth((d[2] - 0.75) / 0.25);
    return { p: V.mul(d, bulge), c, a: [0, 0, 1, 0] };
  }, 0.1);
}
function lidGeoFn(fur, liner, lashLen, upperMax = 1.85, lowerMax = 1.4) {
  return upper => {
    const maxP = upper ? upperMax : lowerMax;
    const cap = gridGeo(28, 10, (u, v) => {
      const th = u * TAU, pol = v * maxP, s = upper ? 1 : -1;
      const p = [Math.sin(pol) * Math.cos(th), s * Math.cos(pol), Math.sin(pol) * Math.sin(th)];
      const edge = smooth((v - 0.8) / 0.2);
      return { p, c: V.lerp(fur, liner, edge), a: [0, 0.45 * (1 - edge), 0.04 + edge * 0.3, 0], t: [u * 0.12, v * 0.06] };
    }, { wrapU: true, flip: true });
    if (!upper || !lashLen) return cap;
    // kipriklar
    const parts = [cap];
    for (let i = 0; i < 9; i++) {
      const th = Math.PI * (0.2 + 0.6 * i / 8) * 1; // old tomoni (z>0)
      const pol = maxP;
      const base = [Math.sin(pol) * Math.cos(th), Math.cos(pol), Math.sin(pol) * Math.sin(th)];
      const out = V.norm(base), L = lashLen * (0.7 + 0.5 * Math.sin(Math.PI * i / 8));
      parts.push(tubeGeo(4, 5, v => ({ p: V.add(base, V.add(V.mul(out, v * L * 0.8), [0, -v * L * 0.25 + v * v * L * 0.9, 0])), r: 0.022 * (1 - v) + 0.003, c: liner, a: [0, 0, 0.2, 0] })));
    }
    return mergeGeo(parts);
  };
}
// ----------------------------- TULKI -----------------------------
const FOX_CFG = (() => {
  const C = FOX_COL;
  return {
    name: 'Tulki', seed: 1.3, shells: 7, furLen: 0.0065, furDensity: 620,
    hipH: 0.16, hipZ: -0.10, bodyHalf: 0.12, stride: 0.24,
    sitHipH: 0.07, sitPitch: 0.6, sitShift: 0.02, begPitch: 0.6, lieHipH: 0.075,
    shoulder: [0.036, -0.03, 0.19], hip: [0.038, -0.035, 0.01],
    footF: 0.09, footH: -0.125, footW: 0.034, pawH: 0.012,
    sitFootF: 0.10, sitFootH: -0.04, lieFootF: 0.21, lieFootH: -0.03, begPaw: [0.145, 0.10],
    legF: [0.07, 0.075], legFR: [v => lerp(0.025, 0.016, v), v => lerp(0.014, 0.011, v)],
    legH: [0.072, 0.082], legHR: [v => lerp(0.03, 0.0155, v), v => lerp(0.0135, 0.0105, v)],
    legColU: v => V.lerp(C.or, C.orD, v * 0.5), legColL: v => V.lerp(C.orD, C.sock, smooth((v - 0.05) / 0.4)),
    neckBase: [0, 0.045, 0.215], neckLen: 0.075, neckEl: 0.95, neckTop: [0, -0.03, -0.035],
    eyePos: [0.036, 0.013, 0.051], eyeR: 0.0195, eyeYaw: 0.3, lidOpen: 0.95, lidLowOpen: 0.72,
    brow: [0.0105, 0.0032, 0.0055], browPos: [0.030, 0.038, 0.056], browCol: srgb('#EE8A36'),
    earPos: [0.04, 0.05, -0.012], earRoll: 0.36, earPitch: 0.12, earYaw: 0.22,
    jaw: { pivot: [0, -0.038, 0.036], r: [0.021, 0.0085, 0.04], mouthPos: [0, -0.038, 0.083] },
    nosePos: [0, -0.013, 0.126],
    bodyGeo: () => sculptGeo(46, 32, d => {
      let x = d[0] * 0.066, y = d[1] * 0.07, z = d[2] * 0.15;
      const fz = d[2], chest = smooth((fz + 0.3) / 1.1);
      x *= 0.9 + 0.16 * chest; y *= 0.92 + 0.14 * chest;
      if (d[1] < 0) y *= 1 - 0.16 * Math.exp(-((fz + 0.15) ** 2) / 0.15);
      y += 0.006 * Math.exp(-((fz - 0.5) ** 2) / 0.1) * Math.max(0, d[1]);
      const top = smooth((d[1] - 0.2) / 0.6), belly = smooth((-d[1] - 0.25) / 0.35), chw = smooth((fz - 0.55) / 0.3) * smooth((0.35 - d[1]) / 0.5);
      let c = V.lerp(C.or, C.orD, top * 0.55); c = V.lerp(c, C.cream, belly); c = V.lerp(c, C.white, chw);
      return { p: [x, y, z + 0.1], c, a: [0, 1, 0.05, 0] };
    }, 0.15),
    chestGeo: () => sculptGeo(28, 20, d => {
      const n = 1 + 0.12 * Math.max(0, vnoise2(Math.atan2(d[0], d[2]) * 5, d[1] * 5));
      return { p: [d[0] * 0.044 * n, d[1] * 0.05 * n - 0.01, d[2] * 0.034 * n + 0.205], c: C.white, a: [0, 1, 0.04, 0] };
    }, 0.06),
    headGeo: () => sculptGeo(56, 40, d => {
      let x = d[0] * 0.074, y = d[1] * 0.068, z = d[2] * 0.07;
      const ax = Math.abs(d[0]);
      const cheek = Math.exp(-((ax - 0.8) ** 2 / 0.06 + (d[1] + 0.3) ** 2 / 0.10 + (d[2] - 0.1) ** 2 / 0.25));
      x += Math.sign(d[0]) * 0.026 * cheek; y -= 0.012 * cheek;
      const tuft = Math.exp(-((ax - 0.92) ** 2 / 0.02 + (d[1] + 0.45) ** 2 / 0.03 + (d[2] + 0.05) ** 2 / 0.1));
      x += Math.sign(d[0]) * 0.013 * tuft; y -= 0.011 * tuft;
      if (d[1] > 0.4) y -= (d[1] - 0.4) * 0.01;
      const eL = gauss3(d, [0.52, 0.17, 0.83], 0.25), eR = gauss3(d, [-0.52, 0.17, 0.83], 0.25);
      z -= 0.008 * (eL + eR);
      z += 0.012 * gauss3(d, [0, -0.3, 0.95], 0.5);
      const low = smooth((-d[1] - 0.05) / 0.35), front = smooth((d[2] - 0.2) / 0.5);
      const wa = clamp(low * (0.45 + 0.55 * front) + cheek * 0.95 + tuft, 0, 1);
      let c = V.lerp(C.or, C.orD, smooth((d[1] - 0.5) / 0.5) * 0.45);
      c = V.lerp(c, C.cream, 0.25 * Math.max(gauss3(d, [0.45, 0.35, 0.8], 0.18), gauss3(d, [-0.45, 0.35, 0.8], 0.18)));
      c = V.lerp(c, C.white, wa);
      return { p: [x, y, z], c, a: [0, 1 - 0.85 * Math.max(gauss3(d, [0.52, 0.17, 0.83], 0.22), gauss3(d, [-0.52, 0.17, 0.83], 0.22)), 0.05, 0] };
    }, 0.07),
    snoutGeo: () => sculptGeo(34, 26, d => {
      const taper = 1 - 0.42 * smooth((d[2] + 0.1) / 1.1);
      const x = d[0] * 0.028 * taper, y = d[1] * 0.024 * taper, z = d[2] * 0.056;
      const top = smooth((d[1] - 0.05) / 0.5) * (1 - smooth((d[2] - 0.85) / 0.15));
      return { p: [x, y - 0.022, z + 0.07], c: V.lerp(C.white, C.or, top), a: [0, 0.6 * (1 - smooth((d[2] - 0.55) / 0.3)), 0.06, 0] };
    }, 0.05),
    noseGeo: () => xformGeo(sculptGeo(20, 14, d => ({ p: [d[0] * 0.0125, d[1] * 0.0095 * (d[1] > 0 ? 1 : 0.8), d[2] * 0.0095], c: C.nose, a: [0, 0, 0.85, 0] })), M4.trs([0, -0.013, 0.124], Q.ident(), [1, 1, 1])),
    jawGeo: () => xformGeo(ellipsoid(0.021, 0.0085, 0.04, C.white, [0, 0.5, 0.05, 0], 18, 12), M4.trs([0, -0.004, 0.045], Q.ident(), [1, 1, 1])),
    neckGeo: () => tubeGeo(20, 10, v => ({ p: [0, v * 0.075, 0], r: 0.037 * (v < 0.05 || v > 0.95 ? 0.6 : 1), c: th => V.lerp(C.or, C.white, smooth((-Math.cos(th) - 0.1) / 0.5)), a: [0, 1, 0.05, 0] }), 0.06),
    earGeo: () => {
      const Hh = 0.105, W0 = 0.036, cupK = 0.55, th = 0.004;
      const wv = v => W0 * Math.pow(1 - v, 0.9) * (1 - 0.25 * Math.pow(v, 3)) + 0.0006;
      const surf = back => gridGeo(14, 14, (u, v) => {
        const x = (u - 0.5) * 2, w = wv(v), cup = (1 - x * x) * w * cupK;
        const bend = -0.014 * v * v;
        const z = back ? -cup * 0.55 - th * (1 - x * x) * (1 - v) + bend - 0.002 * (1 - x * x) : -cup + bend + 0.0;
        const tip = smooth((v - 0.62) / 0.22), edge = smooth((Math.abs(x) - 0.7) / 0.3);
        let c;
        if (back) c = V.lerp(V.lerp(C.or, C.orD, 0.25), C.earTip, tip);
        else { c = V.lerp(C.inner, C.white, smooth((0.6 - Math.abs(x)) / 0.6) * (1 - v) * 0.8); c = V.lerp(c, C.or, edge * 0.8); c = V.lerp(c, C.earTip, tip * 0.85); }
        const fur = back ? 0.4 : 0.55 * smooth((0.75 - Math.abs(x)) / 0.4) * (1 - v * 0.5) + 0.1;
        return { p: [x * w, v * Hh, z], c, a: [0, fur, 0.04, 0], t: [u * 0.07, v * 0.1] };
      }, { flip: !back });
      return mergeGeo([surf(false), surf(true)]);
    },
    eyeGeo: eyeGeoFn(C.irisIn, C.irisOut, C.ring),
    lidGeo: lidGeoFn(C.or, C.liner, 0.2),
    pawGeo: () => xformGeo(ellipsoid(0.016, 0.0105, 0.022, C.sock, [0, 0.4, 0.05, 0], 16, 10), M4.trs([0, 0, 0.006], Q.ident(), [1, 1, 1])),
    tailPath: (v, s) => {
      const base = [0, 0.032, -0.048], Lt = 0.30, n = 14;
      let p = base.slice();
      const steps = v * n;
      for (let i = 0; i < steps; i++) {
        const frac = Math.min(1, steps - i);
        const w = (i + 0.5 * frac) / n;
        let el = -0.5 + s.up * 0.8 + (0.7 + s.up * 0.4) * w * w;
        el = lerp(el, -0.15 + 0.15 * w, s.curl);
        const wag = s.wag * 0.55 * Math.sin(s.t * 9) * (0.3 + w) + 0.08 * Math.sin(s.t * 1.7) * w * (1 + s.wind) + s.mv * 0.12 * Math.sin(TAU * s.ph) * w;
        const yaw = wag + s.curl * 3.0 * w;
        const dir = [Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el)];
        p = V.add(p, V.mul(dir, Lt / n * frac));
      }
      return { p };
    },
    tailR: v => (0.006 + 0.036 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.92 + 0.02)), 0.75)) * (v > 0.9 ? Math.sqrt(Math.max(0, (1 - v) / 0.1)) : 1),
    tailCol: v => V.lerp(V.lerp(C.or, C.orD, 0.3 * Math.sin(v * 3)), C.white, smooth((v - 0.8) / 0.08)),
  };
})();
// ----------------------------- KIYIK (jayron) -----------------------------
const DEER_COL = { tan: srgb('#C99158'), tanD: srgb('#8E5C32'), white: srgb('#F6EFE6'), stripe: srgb('#4E3020'), horn: srgb('#3A322C'), nose: srgb('#1A1412'), irisIn: srgb('#6A3A1A'), irisOut: srgb('#1E0F08') };
const DEER_CFG = (() => {
  const C = DEER_COL;
  return {
    name: 'Kiyik', seed: 4.7, shells: 3, furLen: 0.0028, furDensity: 900,
    hipH: 0.43, hipZ: -0.17, bodyHalf: 0.2, stride: 0.55,
    sitHipH: 0.2, sitPitch: 0.4, sitShift: 0, begPitch: 0, lieHipH: 0.12,
    shoulder: [0.042, -0.045, 0.32], hip: [0.046, -0.03, 0.0],
    footF: 0.15, footH: -0.17, footW: 0.042, pawH: 0.02,
    sitFootF: 0.15, sitFootH: -0.1, lieFootF: 0.3, lieFootH: -0.1, begPaw: [0.3, 0.2],
    legF: [0.19, 0.205], legFR: [v => lerp(0.032, 0.016, v), v => lerp(0.012, 0.0085, v)],
    legH: [0.205, 0.215], legHR: [v => lerp(0.045, 0.02, v), v => lerp(0.013, 0.0085, v)],
    legColU: v => V.lerp(C.tan, C.tanD, v * 0.3), legColL: v => V.lerp(C.tan, C.white, smooth((v - 0.4) / 0.4) * 0.6),
    neckBase: [0, 0.055, 0.37], neckLen: 0.2, neckEl: 1.05, neckTop: [0, -0.02, -0.035],
    eyePos: [0.029, 0.012, 0.03], eyeR: 0.0135, eyeYaw: 0.55, lidOpen: 0.95, lidLowOpen: 0.7,
    brow: [0.011, 0.0032, 0.005], browPos: [0.026, 0.033, 0.035], browCol: srgb('#F4E8D8'),
    earPos: [0.028, 0.033, -0.022], earRoll: 1.0, earPitch: 0.25, earYaw: 0.45,
    jaw: { pivot: [0, -0.036, 0.03], r: [0.017, 0.0075, 0.05], mouthPos: [0, -0.034, 0.075] },
    nosePos: [0, -0.02, 0.118], headScale: 1.12,
    bodyGeo: () => sculptGeo(46, 32, d => {
      let x = d[0] * 0.072, y = d[1] * 0.088, z = d[2] * 0.215;
      const fz = d[2], chest = smooth((fz + 0.2) / 1.0);
      x *= 0.9 + 0.12 * chest;
      if (d[1] < 0) y *= 1 - 0.22 * Math.exp(-((fz + 0.05) ** 2) / 0.2);
      const belly = smooth((-d[1] - 0.15) / 0.3), stripe = Math.exp(-((d[1] + 0.05) ** 2) / 0.012) * smooth((0.85 - Math.abs(fz)) / 0.3);
      const rump = smooth((-fz - 0.75) / 0.2) * smooth((0.5 - d[1]) / 0.6);
      let c = V.lerp(C.tan, C.tanD, smooth((d[1] - 0.4) / 0.5) * 0.4);
      c = V.lerp(c, C.stripe, stripe * 0.85); c = V.lerp(c, C.white, Math.max(belly, rump));
      return { p: [x, y, z + 0.17], c, a: [0, 1, 0.12, 0] };
    }, 0.2),
    headGeo: () => sculptGeo(48, 36, d => {
      let x = d[0] * 0.042, y = d[1] * 0.045, z = d[2] * 0.052;
      for (const s of [1, -1]) z -= 0.004 * gauss3(d, [s * 0.62, 0.2, 0.7], 0.25);
      const wface = Math.max(gauss3(d, [0.4, 0.15, 0.85], 0.22), gauss3(d, [-0.4, 0.15, 0.85], 0.22));
      let c = V.lerp(C.tan, C.white, clamp(smooth((-d[1] - 0.2) / 0.3) + wface * 0.8, 0, 1));
      return { p: [x, y, z], c, a: [0, 1 - 0.9 * Math.max(gauss3(d, [0.62, 0.2, 0.7], 0.2), gauss3(d, [-0.62, 0.2, 0.7], 0.2)), 0.12, 0] };
    }, 0.05),
    snoutGeo: () => sculptGeo(34, 26, d => {
      const taper = 1 - 0.38 * smooth((d[2] + 0.1) / 1.1);
      const x = d[0] * 0.022 * taper, y = d[1] * 0.023 * taper, z = d[2] * 0.064;
      const stripe = Math.exp(-(d[0] * d[0]) / 0.08) * smooth((d[1] - 0.2) / 0.4);
      const sideW = smooth((Math.abs(d[0]) - 0.5) / 0.3) * smooth((d[1] + 0.2) / 0.5);
      let c = V.lerp(C.tan, C.tanD, stripe * 0.7); c = V.lerp(c, C.white, sideW * 0.8 + smooth((-d[1] - 0.3) / 0.3));
      return { p: [x, y - 0.018, z + 0.058], c, a: [0, 0.6, 0.1, 0] };
    }, 0.05),
    noseGeo: () => xformGeo(ellipsoid(0.011, 0.008, 0.008, C.nose, [0, 0, 0.85, 0], 16, 10), M4.trs([0, -0.018, 0.118], Q.ident(), [1, 1, 1])),
    jawGeo: () => xformGeo(ellipsoid(0.017, 0.0075, 0.05, C.white, [0, 0.5, 0.1, 0], 16, 10), M4.trs([0, -0.003, 0.05], Q.ident(), [1, 1, 1])),
    neckGeo: () => tubeGeo(20, 12, v => ({ p: [0, v * 0.2, 0], r: lerp(0.046, 0.03, Math.sqrt(v)) * (v < 0.04 || v > 0.96 ? 0.6 : 1), c: th => V.lerp(C.tan, C.white, smooth((-Math.cos(th) - 0.2) / 0.5)), a: [0, 1, 0.1, 0] }), 0.06),
    earGeo: () => gridGeo(16, 12, (u, v) => {
      const th = u * TAU, w = 0.021 * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * v)), 0.6) * (1 - v * 0.2) + 0.001, dz = 0.007 * (1 - v) + 0.001;
      const sn = Math.sin(th), cs = Math.cos(th);
      const x = cs * w * 0.8, z = (sn > 0 ? sn * dz * 0.3 : sn * dz) - 0.01 * v * v, y = v * 0.064;
      const inner = sn > 0 ? smooth((0.9 - Math.abs(cs)) / 0.3) : 0;
      return { p: [x, y, z], c: V.lerp(C.tan, C.white, inner * 0.8), a: [0, 0.4, 0.1, 0], t: [u * 0.12, v * 0.08] };
    }, { wrapU: true }),
    eyeGeo: eyeGeoFn(C.irisIn, C.irisOut, srgb('#0A0503')),
    lidGeo: lidGeoFn(C.tan, srgb('#140B07'), 0.32),
    pawGeo: () => xformGeo(ellipsoid(0.012, 0.016, 0.016, srgb('#2A221E'), [0, 0, 0.5, 0], 12, 8), M4.trs([0, 0, 0.004], Q.ident(), [1, 1, 1])),
    hornGeo: s => tubeGeo(10, 30, v => {
      const L = 0.2, y = v * L;
      const p = [s * (0.014 + Math.sin(v * Math.PI * 0.9) * 0.03 - v * v * 0.012), 0.035 + y * 0.95, -0.01 - Math.sin(v * Math.PI) * 0.05 + v * v * v * 0.05];
      const r = (0.009 * (1 - v) + 0.0015) * (1 + 0.15 * Math.max(0, Math.sin(v * 70)) * (v < 0.75 ? 1 : 0));
      return { p, r: v > 0.98 ? 0.0008 : r, c: V.lerp(C.horn, srgb('#6E6257'), v * 0.6), a: [0, 0, 0.4, 0] };
    }),
    tailPath: (v, s) => ({ p: [0, 0.06 - v * 0.06 + s.up * v * 0.04, -0.05 - v * 0.07 + Math.sin(s.t * 6) * s.wag * 0.01 * v] }),
    tailR: v => 0.012 * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)) + 0.002,
    tailCol: v => V.lerp(C.tan, srgb('#1C1410'), smooth((v - 0.3) / 0.4)),
    bodyHalf2: 0,
  };
})();

// ----------------------------- GUL -----------------------------
const FLOWER_COL = { white: srgb('#FFF8F4'), pink: srgb('#F58BB0'), pinkD: srgb('#E05A8E'), stem: srgb('#4E8E36'), leaf: srgb('#5FA040'), dry: srgb('#8A6A4C'), dryStem: srgb('#7A6646'), gold: srgb('#FFC93C'), seed: srgb('#5A3A22') };
function petalGeo(len, wid, wilt) {
  const C = FLOWER_COL;
  return gridGeo(10, 14, (u, v) => {
    const x = (u - 0.5) * 2;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.65)), 0.85) * (0.75 + 0.25 * v);
    const cup = 0.35 * w;
    let px = x * w, py = x * x * cup, pz = v * len;
    py += Math.sin(v * Math.PI) * len * 0.08;
    if (wilt) { // qurigan, burishgan
      py += Math.sin(x * 6 + v * 9) * 0.003 + v * v * len * 0.3; px *= 0.7 + 0.2 * Math.sin(v * 7); pz *= 0.85;
    }
    const tip = Math.pow(v, 1.6), vein = Math.exp(-x * x * 40) * 0.15;
    const c = V.lerp(V.lerp(C.white, C.pink, tip * 0.9 + Math.abs(x) * 0.12 * v), C.pinkD, smooth((v - 0.8) / 0.2) * 0.4 + vein * v);
    return { p: [px, py, pz], c, a: [0.6 * v, 0, 0.35, 1] };
  });
}
function leafGeo(len, wid) {
  const C = FLOWER_COL;
  return gridGeo(8, 12, (u, v) => {
    const x = (u - 0.5) * 2, w = wid * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.9);
    return { p: [x * w, x * x * w * 0.3 + Math.sin(v * Math.PI) * len * 0.1 - v * v * len * 0.15, v * len], c: V.mul(C.leaf, 0.75 + 0.35 * v - Math.exp(-x * x * 50) * 0.2), a: [0.5 * v, 0, 0.45, 0] };
  });
}
class Flower {
  constructor(R, pos) {
    this.R = R; this.pos = pos; const C = FLOWER_COL;
    this.mPet = R.mesh(petalGeo(0.05, 0.022, false)); this.mPetIn = R.mesh(petalGeo(0.036, 0.017, false));
    this.mPetW = R.mesh(petalGeo(0.045, 0.02, true));
    this.mLeaf = R.mesh(leafGeo(0.06, 0.016));
    const disc = ellipsoid(0.011, 0.0055, 0.011, C.gold, [0, 0, 0.4, 1], 16, 10);
    const st = [disc];
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, b = [Math.cos(a) * 0.006, 0.004, Math.sin(a) * 0.006];
      st.push(tubeGeo(4, 4, v => ({ p: V.add(b, [Math.cos(a) * v * 0.006, v * 0.012, Math.sin(a) * v * 0.006]), r: 0.0008 + (v > 0.85 ? 0.0012 : 0), c: v > 0.8 ? srgb('#FFB020') : srgb('#FFF0A0'), a: [0, 0, 0.3, 1] })));
    }
    this.mDisc = R.mesh(mergeGeo(st));
    const seeds = [];
    for (let i = 0; i < 7; i++) { const a = i * TAU / 7, r = i ? 0.0055 : 0; seeds.push(xformGeo(ellipsoid(0.0032, 0.0026, 0.0042, C.seed, [0, 0, 0.5, 0], 10, 8), M4.trs([Math.cos(a) * r, 0.006, Math.sin(a) * r], Q.euler(0.3, a, 0), [1, 1, 1]))); }
    this.mSeeds = R.mesh(mergeGeo(seeds));
    this.stem = R.mesh(this.stemGeo({ droop: 0, sway: 0, health: 1, lookYaw: 0, t: 0 }), true);
    this.items = [];
  }
  stemPath(s) {
    const L = 0.17 * (0.8 + 0.2 * s.health), n = 12, pts = [], tans = [];
    let p = gp(this.pos[0], this.pos[1], -0.01);
    const dirYaw = s.lookYaw;
    for (let i = 0; i <= n; i++) {
      const w = i / n;
      const a = s.droop * 2.1 * Math.pow(w, 1.6) + s.sway * w + s.bow * 0.6 * w * w;
      const d = [Math.sin(a) * Math.sin(dirYaw), Math.cos(a), Math.sin(a) * Math.cos(dirYaw)];
      pts.push(p.slice()); tans.push(d);
      p = V.add(p, V.mul(d, L / n));
    }
    return { pts, tans };
  }
  stemGeo(s) {
    const C = FLOWER_COL, sp = this.stemPath(s), n = sp.pts.length - 1;
    const col = V.lerp(C.dryStem, C.stem, s.health);
    return tubeGeo(8, n, v => { const j = Math.round(v * n); return { p: sp.pts[j], r: lerp(0.0042, 0.0028, v) * (j === 0 ? 0.6 : 1), c: col, a: [0.5 * v, 0, 0.25, 0] }; });
  }
  // fs: {health, open, glow, droop, wilt, seeds, fallen, lookYaw, bow, scale}
  update(t, fs, wind) {
    const out = this.items; out.length = 0;
    const push = (mesh, mat, world) => out.push({ mesh, mat, world, nm: M4.normalMat(world) });
    const C = FLOWER_COL;
    const windS = wind ? Math.hypot(wind[0], wind[2]) : 0;
    const s = { droop: fs.droop || 0, health: fs.health, lookYaw: fs.lookYaw || 0, bow: fs.bow || 0, sway: (0.05 + windS * 0.12) * Math.sin(t * 2.1) * (1 - (fs.droop || 0) * 0.7) + (fs.shiver || 0) * 0.08 * Math.sin(t * 31) };
    this.R.updateMesh(this.stem, this.stemGeo(s));
    const dry = 1 - fs.health;
    push(this.stem, { cast: true, gloss: 1 }, M4.ident());
    const sp = this.stemPath(s), n = sp.pts.length - 1;
    // barglar
    [[3, 0.6, 1], [5, -2.2, 0.85]].forEach(([j, az, sc]) => {
      const p = sp.pts[j];
      const q = Q.mul(Q.axis([0, 1, 0], az + s.lookYaw * 0.3), Q.axis([1, 0, 0], -(0.6 - (fs.droop || 0) * 1.1 - dry * 0.4)));
      push(this.mLeaf, { cast: true, mix: [...C.dry, dry * 0.9], gloss: 1 }, M4.trs(p, q, [sc, sc, sc]));
    });
    // boshcha ramkasi
    const top = sp.pts[n], tan = sp.tans[n];
    const up = V.norm(tan);
    let ref = Math.abs(up[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const X = V.norm(V.cross(ref, up)), Z = V.cross(X, up);
    const sc = fs.scale == null ? 1 : fs.scale;
    const headM = M4.mul(M4.fromBasis(X, up, Z, top), M4.trs([0, 0, 0], Q.ident(), [sc, sc, sc]));
    this.headM = headM; this.headPos = top;
    const glow = fs.glow || 0;
    const open = fs.open, wilt = fs.wilt || 0, fallen = fs.fallen || 0;
    const petMat = { cast: true, gloss: 1, emis: glow * 1.6, mix: [...C.dry, dry * 0.85], rim: 1.2 };
    const nOut = 7, nIn = 5;
    for (let i = 0; i < nOut; i++) {
      if (fallen > (i + 0.5) / nOut) continue;
      const az = i * TAU / nOut + 0.2;
      const breath = Math.sin(t * 1.3 + i) * 0.03 * open;
      const elev = lerp(1.35, 0.32, open) + wilt * -1.5 + breath - dry * 0.25 * open;
      const q = Q.mul(Q.axis([0, 1, 0], az), Q.axis([1, 0, 0], -elev));
      push(wilt > 0.5 ? this.mPetW : this.mPet, petMat, M4.mul(headM, M4.trs([0, 0.004, 0], q, [1, 1, 1])));
    }
    for (let i = 0; i < nIn; i++) {
      if (fallen > 0.6 + i * 0.08) continue;
      const az = i * TAU / nIn + 0.6;
      const elev = lerp(1.45, 0.75, open) + wilt * -1.2 - dry * 0.15 * open;
      const q = Q.mul(Q.axis([0, 1, 0], az), Q.axis([1, 0, 0], -elev));
      push(wilt > 0.5 ? this.mPetW : this.mPetIn, petMat, M4.mul(headM, M4.trs([0, 0.006, 0], q, [1, 1, 1])));
    }
    // o‘rta
    push(this.mDisc, { cast: true, gloss: 1, emis: 0.3 + glow * 3, mix: [...C.dry, dry * 0.8] }, M4.mul(headM, M4.trs([0, 0.004, 0], Q.ident(), [open * 0.6 + 0.4, open * 0.6 + 0.4, open * 0.6 + 0.4])));
    if ((fs.seeds || 0) > 0.01) push(this.mSeeds, { cast: true, gloss: 1 }, M4.mul(headM, M4.trs([0, 0.004, 0], Q.ident(), [fs.seeds, fs.seeds, fs.seeds])));
    // to‘kilgan barglar yerda
    if (fallen > 0) {
      for (let i = 0; i < nOut + 2; i++) {
        if (fallen < (i + 0.5) / (nOut + 2)) continue;
        const a = i * 2.3 + 0.4, r = 0.03 + (i % 3) * 0.022;
        const gx = this.pos[0] + Math.cos(a) * r, gz = this.pos[1] + Math.sin(a) * r;
        push(this.mPetW, { cast: false, mix: [...C.dry, 0.92], gloss: 0.5 }, M4.trs(gp(gx, gz, 0.004), Q.euler(0.1, a, 0.2 * (i % 2 ? 1 : -1)), [0.9, 0.9, 0.9]));
      }
    }
    return out;
  }
}
// ----------------------------- URUG‘ va NIHOL -----------------------------
function seedGeo() { return ellipsoid(0.0045, 0.0036, 0.0058, srgb('#6A4426'), [0, 0, 0.7, 0.25], 14, 10); }
class Sprout {
  constructor(R, pos) {
    this.R = R; this.pos = pos;
    this.mLeaf = R.mesh(gridGeo(8, 10, (u, v) => {
      const x = (u - 0.5) * 2, w = 0.011 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.8);
      return { p: [x * w, x * x * w * 0.5 + Math.sin(v * Math.PI) * 0.003, v * 0.022], c: V.mul(srgb('#7FD04A'), 0.75 + 0.4 * v), a: [0.4, 0, 0.6, 0.15] };
    }));
    this.stem = R.mesh(this.stemGeo(0.0, 0), true);
    this.items = [];
  }
  stemGeo(g, t) {
    const h = 0.004 + 0.06 * g, b = gp(this.pos[0], this.pos[1], -0.004);
    return tubeGeo(8, 8, v => ({ p: V.add(b, [Math.sin(v * 2.2) * 0.004 * g + Math.sin(t * 1.5) * 0.001 * v, v * h, 0]), r: 0.0022 * (1 - 0.3 * v), c: srgb('#8FD45A'), a: [0.3 * v, 0, 0.5, 0.1] }));
  }
  update(t, g, unf) {
    const out = this.items; out.length = 0; if (g <= 0) return out;
    this.R.updateMesh(this.stem, this.stemGeo(g, t));
    out.push({ mesh: this.stem, mat: { cast: true, gloss: 1, emis: 0.3 }, world: M4.ident(), nm: M4.normalMat(M4.ident()) });
    const h = 0.004 + 0.06 * g, top = gp(this.pos[0] + Math.sin(2.2) * 0.004 * g, this.pos[1], -0.004 + h);
    for (const s of [1, -1]) {
      const el = lerp(1.45, 0.25, unf) + Math.sin(t * 1.3 + s) * 0.04;
      const q = Q.mul(Q.axis([0, 1, 0], s > 0 ? Math.PI / 2 : -Math.PI / 2), Q.axis([1, 0, 0], -el));
      const sc = (0.4 + 0.6 * g) * 1.5;
      const m = M4.trs(top, q, [sc, sc, sc]);
      out.push({ mesh: this.mLeaf, mat: { cast: true, gloss: 1, emis: 0.35 }, world: m, nm: M4.normalMat(m) });
    }
    return out;
  }
}

// =====================================================================
//  07 · HIKOYA: 11 sahna, vaqt treklari, yorug‘lik, kamera
//  «SO‘NGGI YOMG‘IR TOMCHISI»
// =====================================================================
const DURATION = 124;
const SCENES = [
  { n: 1, t: 0, name: 'Yolg‘izlik' }, { n: 2, t: 11, name: 'So‘nggi suv' }, { n: 3, t: 23, name: 'Mehr' },
  { n: 4, t: 37, name: 'Mo‘jiza' }, { n: 5, t: 47, name: 'Vasvasa' }, { n: 6, t: 58, name: 'Xato' },
  { n: 7, t: 68, name: 'Haqiqat' }, { n: 8, t: 78, name: 'Kechikkan pushaymon' }, { n: 9, t: 89, name: 'Oxirgi umid' },
  { n: 10, t: 97, name: 'Yangi hayot' }, { n: 11, t: 109, name: 'Yakun' },
];
const SEED_SPOT = [-0.06, 0.2];
const SEED_FOUND = [-0.13, 0.30];
const FAKE_ONE = [45.4, -26.7];

// ---------------- yorug‘lik / muhit presetlari ----------------
function sunV(el, az) { el *= DEG; az *= DEG; return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]; }
const L3 = (h, k = 1) => V.mul(srgb(h), k);
function preset(o) {
  return Object.assign({
    sunDir: sunV(45, 200), sunCol: L3('#FFF0D8', 3), skyZen: L3('#3F7ED0'), skyHor: L3('#F2DAB4'), skyAmb: L3('#A8C0E8', 0.5), gndAmb: L3('#E0A060', 0.42),
    rimCol: L3('#FFE0B0', 0.25), fogCol: L3('#EED8B4'), sunFogCol: L3('#FFE4B8'), fogDen: 0.0045, moonDir: sunV(30, 60), cloudCol: L3('#FFF4E8'),
    stars: 0, clouds: 0.25, sunSize: 0.0009, overcast: 0, warmSSS: 0.5, wind: [0.6, 0, 0.25], sand: 0.3,
    exposure: 1.0, sat: 1.05, contrast: 1.04, bloom: 0.35, bloomThr: 2.6, vig: 0.32, grain: 0.022, haze: 0, tint: [1.04, 1.0, 0.95], lift: [0.0, 0.0, 0.0],
  }, o);
}
const P = {
  NOON: preset({ sunDir: sunV(42, 215), sunCol: L3('#FFEED6', 2.9), skyZen: L3('#4A86D2'), skyHor: L3('#F4E0C0'), fogCol: L3('#F2DEC0'), haze: 1.2, wind: [1.1, 0, 0.35], sand: 1.0, exposure: 0.8, tint: [1.06, 1.0, 0.92], lift: [0.02, 0.01, 0.0] }),
  AFTER: preset({ sunDir: sunV(34, 230), sunCol: L3('#FFE6C4', 2.9), skyZen: L3('#4A80CC'), skyHor: L3('#F4D6AE'), haze: 0.7, wind: [0.7, 0, 0.2], sand: 0.45, exposure: 0.82 }),
  MORNING: preset({ sunDir: sunV(15, 105), sunCol: L3('#FFC48A', 2.8), exposure: 0.88, skyZen: L3('#6F98D8'), skyHor: L3('#F8C79A'), skyAmb: L3('#9FB2E0', 0.5), gndAmb: L3('#D89060', 0.4), fogCol: L3('#F4CAA0'), sunFogCol: L3('#FFC890'), rimCol: L3('#FFC080', 0.4), wind: [0.4, 0, 0.1], sand: 0.25, tint: [1.07, 0.99, 0.92] }),
  HIGH: preset({ sunDir: sunV(62, 200), sunCol: L3('#FFF0DC', 3.0), haze: 1.0, wind: [0.5, 0, 0.2], sand: 0.35, exposure: 0.78 }),
  SUNSET: preset({ sunDir: sunV(7, 280), sunCol: L3('#FF9A50', 3.2), skyZen: L3('#4C63A6'), skyHor: L3('#FF9E62'), skyAmb: L3('#8890C8', 0.45), gndAmb: L3('#C87444', 0.35), rimCol: L3('#FFA060', 0.6), fogCol: L3('#F2A070'), sunFogCol: L3('#FFB070'), fogDen: 0.005, wind: [0.9, 0, 0.3], sand: 0.6, bloom: 0.5, tint: [1.08, 0.97, 0.9], warmSSS: 0.9, sunSize: 0.0016 }),
  MAGIC: preset({ sunDir: sunV(38, 150), sunCol: L3('#9CB4F0', 1.2), skyZen: L3('#0A1430'), skyHor: L3('#28386A'), skyAmb: L3('#4A60A8', 0.75), gndAmb: L3('#30344C', 0.45), rimCol: L3('#9AB8FF', 0.6), fogCol: L3('#1C2A50'), sunFogCol: L3('#2C3C70'), fogDen: 0.006, moonDir: sunV(38, 150), stars: 1, clouds: 0, wind: [0.15, 0, 0.05], sand: 0.0, exposure: 1.35, sat: 1.1, bloom: 0.75, bloomThr: 0.9, tint: [0.98, 1.0, 1.06], warmSSS: 0.2, sunSize: 0 }),
  OVERCAST: preset({ sunDir: sunV(32, 230), sunCol: L3('#D8D6CE', 1.1), skyZen: L3('#7C848E'), skyHor: L3('#B4B2AA'), skyAmb: L3('#A0A4AA', 0.75), gndAmb: L3('#6A685C', 0.5), rimCol: L3('#C0C4C8', 0.15), fogCol: L3('#A8A69E'), sunFogCol: L3('#B8B4AA'), fogDen: 0.012, overcast: 1, clouds: 1, cloudCol: L3('#9A9CA0'), wind: [0.0, 0, 0.0], sand: 0, sat: 0.62, contrast: 0.97, bloom: 0.2, tint: [0.97, 1.0, 1.0], warmSSS: 0.15, sunSize: 0 }),
  DUSK: preset({ sunDir: sunV(3, 290), sunCol: L3('#E09A90', 1.1), skyZen: L3('#26305E'), skyHor: L3('#B88A8C'), skyAmb: L3('#6A70A8', 0.6), gndAmb: L3('#4A3A48', 0.35), rimCol: L3('#E0A0A0', 0.45), fogCol: L3('#7A6A84'), sunFogCol: L3('#D89A90'), moonDir: sunV(12, 80), stars: 0.35, clouds: 0.15, wind: [0.9, 0, 0.3], sand: 0.5, exposure: 1.15, sat: 0.8, tint: [0.98, 0.97, 1.04], sunSize: 0 }),
  NIGHT: preset({ sunDir: sunV(34, 70), sunCol: L3('#A8BAF4', 1.25), skyZen: L3('#0A1428'), skyHor: L3('#2A3A64'), skyAmb: L3('#4258A0', 0.75), gndAmb: L3('#2A2C40', 0.45), rimCol: L3('#A8C0FF', 0.7), fogCol: L3('#1A2648'), sunFogCol: L3('#2A3A68'), fogDen: 0.006, moonDir: sunV(34, 70), stars: 1, clouds: 0, wind: [0.25, 0, 0.08], sand: 0.05, exposure: 1.45, sat: 0.85, bloom: 0.55, bloomThr: 1.0, tint: [0.93, 0.97, 1.1], warmSSS: 0.1, sunSize: 0 }),
  STORM: preset({ sunDir: sunV(30, 70), sunCol: L3('#8C9CCC', 0.8), skyZen: L3('#10121E'), skyHor: L3('#3A3646'), skyAmb: L3('#4A5070', 0.8), gndAmb: L3('#34323C', 0.5), fogCol: L3('#4A4858'), sunFogCol: L3('#3E3C50'), fogDen: 0.07, moonDir: sunV(30, 70), stars: 0.1, wind: [3.4, 0, 0.6], sand: 2.0, exposure: 1.3, sat: 0.7, tint: [0.95, 0.96, 1.05], sunSize: 0 }),
  DAWN: preset({ sunDir: sunV(5, 82), sunCol: L3('#FFA878', 2.8), skyZen: L3('#5C78C2'), skyHor: L3('#FFB88E'), skyAmb: L3('#A098D0', 0.5), gndAmb: L3('#D09070', 0.38), rimCol: L3('#FFC090', 0.55), fogCol: L3('#F4B892'), sunFogCol: L3('#FFC898'), fogDen: 0.005, moonDir: sunV(20, 260), stars: 0.05, clouds: 0.35, cloudCol: L3('#FFD2C0'), wind: [0.1, 0, 0.05], sand: 0.1, bloom: 0.6, bloomThr: 1.9, tint: [1.08, 1.0, 0.95], warmSSS: 0.9, sunSize: 0.0014 }),
  DAWN2: preset({ sunDir: sunV(11, 86), sunCol: L3('#FFC090', 3.0), skyZen: L3('#5E86CE'), skyHor: L3('#FFC8A0'), skyAmb: L3('#A8A8D8', 0.5), gndAmb: L3('#D89870', 0.4), rimCol: L3('#FFD0A0', 0.5), fogCol: L3('#F6C8A4'), sunFogCol: L3('#FFD0A0'), clouds: 0.3, cloudCol: L3('#FFE0D0'), wind: [0.1, 0, 0.05], sand: 0.1, bloom: 0.55, tint: [1.07, 1.0, 0.96], warmSSS: 0.8, sunSize: 0.0013 }),
};
// [vaqt, preset] — orasida silliq o‘tish
const ENV_KEYS = [
  [0, 'NOON'], [11, 'NOON'], [23, 'AFTER'], [26.6, 'AFTER'], [27.6, 'MORNING'], [30.1, 'MORNING'], [31.0, 'HIGH'], [33.2, 'HIGH'], [34.3, 'SUNSET'],
  [36.4, 'SUNSET'], [37.8, 'MAGIC'], [46.6, 'MAGIC'], [47.6, 'MORNING'], [57.5, 'MORNING'], [58.8, 'AFTER'], [61.2, 'AFTER'], [62.2, 'SUNSET'],
  [67.6, 'SUNSET'], [68.8, 'OVERCAST'], [77.6, 'OVERCAST'], [78.6, 'DUSK'], [80.8, 'DUSK'], [82.6, 'NIGHT'], [99.2, 'NIGHT'], [100.0, 'HIGH'],
  [102.8, 'HIGH'], [103.6, 'NIGHT'], [105.8, 'NIGHT'], [106.6, 'STORM'], [108.6, 'STORM'], [109.8, 'DAWN'], [114, 'DAWN'], [121, 'DAWN2'],
];
const ENV_NUM = ['fogDen', 'stars', 'clouds', 'sunSize', 'overcast', 'warmSSS', 'sand', 'exposure', 'sat', 'contrast', 'bloom', 'bloomThr', 'vig', 'grain', 'haze'];
const ENV_VEC = ['sunDir', 'sunCol', 'skyZen', 'skyHor', 'skyAmb', 'gndAmb', 'rimCol', 'fogCol', 'sunFogCol', 'moonDir', 'cloudCol', 'wind', 'tint', 'lift'];
function envAt(t) {
  let i = 0; while (i < ENV_KEYS.length - 1 && ENV_KEYS[i + 1][0] <= t) i++;
  const a = ENV_KEYS[i], b = ENV_KEYS[Math.min(i + 1, ENV_KEYS.length - 1)];
  const u = b === a ? 0 : smoother((t - a[0]) / (b[0] - a[0]));
  const A = P[a[1]], B = P[b[1]], e = {};
  for (const k of ENV_NUM) e[k] = lerp(A[k], B[k], u);
  for (const k of ENV_VEC) e[k] = V.lerp(A[k], B[k], u);
  e.sunDir = V.norm(e.sunDir); e.moonDir = V.norm(e.moonDir);
  return e;
}

// ---------------- harakat yo‘llari (legs) ----------------
// har bir leg: [t0, t1, keys]; keys: [t, [x,z], ease]
const L = linear, EO = easeOut, EI = easeIn, S = smoother;
const FOX_D1 = [0.03, -0.22], FOX_P1 = [0.02, 0.19];
const FOX_LIE1 = [0.16, 0.56], FOX_K1 = [0.06, 0.18], FOX_N1 = [0.09, 0.055], FOX_LIE2 = [0.17, 0.2];
const FOX_LEGS = [
  [0, 23, [[0, [-14.0, 6.2]], [3, [-12.0, 5.3], L], [6, [-10.1, 4.45], L], [8.2, [-8.75, 3.85], L], [9.4, [-8.25, 3.62], EO], [11.1, [-8.25, 3.62], S],
    [11.9, [-7.35, 3.2], EI], [13.3, [-2.9, 1.1], L], [14.3, FOX_D1, EO], [20.7, FOX_D1, S], [21.5, FOX_P1, S], [23, FOX_P1, S]]],
  [23, 27, [[23, FOX_P1], [27, FOX_P1]]],
  [27, 30.5, [[27, [2.6, -1.35]], [28.4, [1.05, -0.35], L], [29.2, [0.16, 0.12], EO], [30.5, [0.16, 0.12], S]]],
  [30.5, 33.5, [[30.5, [0.62, 0.95]], [31.3, [0.16, 0.68], S], [31.9, [0.16, 0.68], S], [32.5, [-0.42, 0.62], S], [33.5, [-0.42, 0.62], S]]],
  [33.5, 47, [[33.5, [0.2, 0.72]], [34.2, [0.08, 0.6], S], [35.7, [0.08, 0.6], S], [36.4, FOX_LIE1, S], [47, FOX_LIE1, S]]],
  [47, 58, [[47, [-0.05, -0.25]], [53.6, [-0.05, -0.25], S], [55.4, [0.45, -0.88], S], [58, [0.45, -0.88], S]]],
  [58, 61.5, [[58, [0.45, -0.88]], [59.8, [0.45, -0.88], S], [60.3, [1.0, -1.2], EI], [61.5, [4.4, -2.9], L], [62.3, [6.2, -3.95], L]]],
  [61.5, 68, [[61.5, [19.2, -10.2]], [63.5, [22.3, -12.0], L], [65.2, [24.6, -13.3], EO], [68, [24.6, -13.3], S]]],
  [68, 78, [[68, [39.8, -23.4]], [70.8, [44.6, -26.05], EO], [71.2, [45.08, -26.5], S], [72.7, [45.08, -26.5], S], [73.7, [45.75, -27.2], S], [77.3, [45.75, -27.2], S], [78, [44.9, -26.7], EI], [78.8, [42.5, -25.4], L]]],
  [78, 81, [[78, [21.5, -11.9]], [81.3, [9.0, -5.0], L]]],
  [81, 99.5, [[81, [4.8, -2.7]], [82.4, [1.8, -0.95], L], [83.8, FOX_K1, EO], [99.5, FOX_K1, S]]],
  [99.5, 101.5, [[99.5, [-8.6, 8.0]], [101.5, [-7.4, 7.1], L], [102.5, [-6.8, 6.65], L]]],
  [101.5, 103, [[101.5, FOX_N1], [103, FOX_N1]]],
  [103, DURATION + 1, [[103, FOX_LIE2], [DURATION + 1, FOX_LIE2]]],
];
const DEER_D2 = [0.0, 0.72];
const DEER_LEGS = [
  [47, 58, [[47, [8.6, -8.4]], [49.6, [5.0, -4.6], L], [51.9, [1.45, 0.45], EO], [53.6, [1.45, 0.45], S], [54.7, [1.15, 1.1], L], [55.5, [0.6, 1.25], L], [56.3, DEER_D2, EO], [58, DEER_D2, S]]],
  [58, 61.5, [[58, DEER_D2], [58.6, [0.6, 0.5], EI], [61.3, [6.6, -3.9], L], [62.2, [8.4, -5.0], L]]],
  [61.5, 68, [[61.5, [21.2, -11.6]], [63.3, [24.4, -13.45], L], [65.0, [26.7, -14.75], EO], [66.0, [26.7, -14.75], S], [66.6, [28.0, -15.5], EI], [68.2, [37.0, -21.0], L]]],
];
function buildTable(legs, cfg, faceTrack) {
  const dt = 1 / 60, tab = [];
  for (const [t0, t1, keys] of legs) {
    const pt = new PathTrack(keys);
    let prev = pt.at(t0), h = null, phase = 0, mvS = 0;
    const n = Math.ceil((t1 - t0) / dt) + 2;
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * dt, p = pt.at(t);
      const vx = (p[0] - prev[0]) / dt, vz = (p[1] - prev[1]) / dt, sp = i ? Math.hypot(vx, vz) : 0;
      if (h === null) { const nx = pt.at(t0 + 0.3); h = Math.atan2(nx[0] - p[0], nx[1] - p[1]); if (!isFinite(h) || Math.hypot(nx[0] - p[0], nx[1] - p[1]) < 1e-4) h = 0; }
      if (sp > 0.06) h = angLerp(h, Math.atan2(vx, vz), 1 - Math.exp(-dt * 7));
      mvS = lerp(mvS, clamp(sp / 0.18, 0, 1), 1 - Math.exp(-dt * 10));
      const stride = cfg.stride * (0.75 + 0.55 * Math.min(sp, 2.5)) * (sp > 1.5 ? 1.25 : 1);
      phase += sp * dt / stride;
      rows.push({ t, p, h, sp, ph: phase, mv: mvS });
      prev = p;
    }
    tab.push({ t0, t1, rows });
  }
  return tab;
}
function sampleTable(tab, t) {
  for (const leg of tab) {
    if (t >= leg.t0 && t < leg.t1 || leg === tab[tab.length - 1]) {
      const f = clamp((t - leg.t0) * 60, 0, leg.rows.length - 1.001), i = Math.floor(f), w = f - i;
      const a = leg.rows[i], b = leg.rows[i + 1] || a;
      return { pos: [lerp(a.p[0], b.p[0], w), lerp(a.p[1], b.p[1], w)], heading: angLerp(a.h, b.h, w), speed: lerp(a.sp, b.sp, w), phase: lerp(a.ph, b.ph, w), moving: lerp(a.mv, b.mv, w), active: t >= leg.t0 && t < leg.t1 };
    }
  }
}
let FOX_TAB, DEER_TAB;
function initStory() { FOX_TAB = buildTable(FOX_LEGS, FOX_CFG); DEER_TAB = buildTable(DEER_LEGS, DEER_CFG); }

// ---------------- tulki treklari ----------------
const FX = {
  tired: T([[0, 1], [11, 1], [11.6, 0.2], [14.5, 0.3], [22, 0.35], [24, 0]]),
  jaw: T([[0, 0.45], [9.2, 0.45], [9.6, 0.15], [10.4, 0], [11.6, 0.35], [14.6, 0.35], [15.2, 0], [19.4, 0], [19.6, 0.12], [19.8, 0], [20.8, 0], [21.0, 0.05], [21.8, 0.05], [22.0, 0.3], [22.8, 0.3], [23.0, 0.05],
    [25.3, 0.05], [25.8, 0.4], [26.8, 0.35], [27, 0.05], [27.2, 0.06], [29.4, 0.06], [30.4, 0.06], [30.6, 0.2], [31.2, 0.08], [31.9, 0.08], [32.1, 0.2], [34.4, 0.1], [34.8, 0.35], [35.1, 0.1], [35.4, 0.35], [35.7, 0.05],
    [42, 0.05], [42.6, 0.35], [44.6, 0.35], [44.8, 0.05], [45.4, 0.05], [45.7, 0.5], [46.8, 0.45], [47, 0.1], [53, 0.1], [53.8, 0.2], [55.5, 0.1], [62, 0.35], [65, 0.35], [66.5, 0.05], [70.5, 0.3],
    [71.5, 0.05], [74.3, 0.05], [74.5, 0.25], [74.9, 0.05], [77.6, 0.4], [80.5, 0.45], [82.5, 0.3], [83.5, 0.05], [87.2, 0.05], [87.6, 0.12], [88, 0.04], [109, 0], [113.4, 0], [113.9, 0.22], [116, 0.18], [117, 0.08]]),
  tongue: T([[0, 0.65], [9.3, 0.65], [9.9, 0], [11.6, 0.6], [14.5, 0.6], [15.0, 0], [25.6, 0], [26, 0.5], [26.8, 0.4], [27, 0], [42.6, 0], [43, 0.2], [44.6, 0], [45.8, 0], [46, 0.7], [46.8, 0.5], [47, 0], [62, 0.4], [65, 0.4], [66, 0], [77.8, 0.5], [80.8, 0.6], [82.6, 0]]),
  earsDown: T([[0, 0.45], [8.5, 0.5], [9.6, 0.85], [10.3, 0.85], [10.6, 0.05], [16.5, 0], [17.4, 0.25], [20, 0.35], [21, 0.05], [23, 0], [33.5, 0], [36.5, 0.15], [37, 0], [53.8, 0], [54.3, 0.45], [55, 0.45], [55.6, 0],
    [66.5, 0], [67.2, 0.7], [68, 0.5], [70.8, 0.2], [72.8, 0.3], [75, 0.9], [76.8, 0.7], [77.3, 0], [81.5, 0], [83, 0.9], [92, 0.8], [92.6, 0], [94.5, 0.1], [97, 0.2], [103, 0.6], [109.5, 0.7], [110.6, 0.15], [112, 0]]),
  earsBack: T([[0, 0.1], [11.5, 0.6], [14, 0.6], [14.5, 0], [56, 0], [74.2, 0], [74.4, 0.9], [75, 0.6], [77, 0], [77.6, 0.7], [81.5, 0.6], [82.5, 0], [106.5, 0], [107, 0.9], [109, 0.9], [110, 0]]),
  earsPerk: T([[0, 0], [10.3, 0], [10.6, 1], [11.3, 0.4], [16.4, 0.3], [16.7, 1], [17.2, 0.4], [23.6, 0.5], [24.3, 1], [27, 0.7], [37.4, 0.5], [38.2, 1], [47, 0.8], [48, 1], [50, 0.7], [52.5, 1], [53.5, 0.6],
    [55.6, 0.6], [56, 1], [58, 0.5], [70.8, 0.6], [92.2, 0], [92.6, 1], [94, 0.6], [111.4, 0], [111.8, 1], [116, 0.8]]),
  tailUp: T([[0, -0.5], [11, -0.5], [11.6, 0.2], [14.5, 0.2], [15.5, -0.1], [17, -0.2], [23.5, -0.1], [24.2, 0.5], [27, 0.3], [47.6, 0.2], [48.4, 0.5], [53.5, 0.6], [55, 0.1], [58, 0.3], [66.6, 0.3], [67.2, -0.5],
    [71, -0.2], [74.4, -0.7], [77, -0.6], [77.6, 0.2], [81.5, 0.1], [83, -0.7], [92.3, -0.6], [92.6, 0.2], [97, 0.2], [109, 0], [111.4, 0], [111.8, 0.6]]),
  tailWag: T([[0, 0], [24, 0], [24.4, 1], [26.6, 0.8], [27.2, 0.1], [29.8, 0.1], [30.2, 0.5], [30.6, 0.1], [38, 0], [42, 0.3], [45.6, 0.4], [45.9, 1], [46.8, 1], [47.3, 0.2], [48.4, 0.6], [53.5, 0.6], [55.2, 0.1],
    [56, 0.4], [58, 0.2], [66.5, 0.3], [67, 0], [92.6, 0], [92.9, 0.4], [94, 0.2], [111.7, 0], [112.2, 0.9], [118, 0.6], [124, 0.4]]),
  tailCurl: T([[0, 0], [36, 0], [36.6, 0.6], [41, 0.6], [42, 0], [84, 0], [85.2, 0.35], [89, 0.35], [89.8, 0], [102.95, 0], [103.05, 0.9], [109, 0.9], [111, 0.3], [112, 0]]),
  lids: T([[0, 0.3], [9.4, 0.35], [9.8, 0.5], [10.3, 0.5], [10.6, 0], [15.2, 0.05], [15.5, 0.3], [16.4, 0.3], [16.6, 0], [23, 0], [25.0, 0], [25.4, 0.45], [26.6, 0.45], [27, 0], [36.4, 0], [37, 0.65], [38, 0.65], [38.6, 0],
    [44.6, 0], [44.8, 1], [45.2, 1], [45.5, 0.6], [46.6, 0.5], [47, 0], [55.6, 0], [56, 0.35], [57.6, 0.35], [58, 0], [66.8, 0.2], [68, 0.3], [73.8, 0.1], [74.2, 0.6], [74.6, 0.25], [75, 0.45], [77, 0.45], [77.4, 0],
    [83, 0.25], [84.5, 0.35], [86.0, 0.55], [88.5, 0.62], [89.2, 0.2], [92.2, 0.2], [92.5, 0], [95, 0.1], [97, 0.1], [101.8, 0.1], [103, 0.1], [103.6, 1], [106.4, 1], [106.8, 0.82], [109.4, 0.85], [109.8, 1], [110.2, 1], [110.8, 0.3], [111.5, 0], [113.4, 0], [113.8, 0.45], [116, 0.4], [117, 0.15]]),
  browSad: T([[0, 0.45], [9.4, 0.5], [9.8, 0.9], [10.3, 0.9], [10.6, 0.1], [16.5, 0.1], [17.2, 0.65], [20.4, 0.75], [21.2, 0.3], [23, 0.3], [24, 0], [53.8, 0], [54.3, 0.75], [55.2, 0.7], [55.6, 0], [58.4, 0.6], [59.6, 0.6],
    [60, 0.2], [66.6, 0.2], [67.2, 0.9], [68.4, 0.6], [70.8, 0.3], [72.6, 0.5], [74.4, 0.3], [75, 1], [77, 0.9], [77.4, 0.3], [81.5, 0.3], [82.8, 1], [92.2, 1], [92.5, 0.3], [94.5, 0.5], [97, 0.4], [101, 0.3], [103, 0.4],
    [109, 0.4], [110.6, 0.3], [111.6, 0], [113.4, 0], [113.8, 0.6], [116, 0.5], [117, 0.15]]),
  browAngry: T([[0, 0], [74.2, 0], [74.4, 0.7], [74.9, 0.3], [75.3, 0], [76.8, 0], [77.1, 0.5], [77.8, 0.3], [79, 0]]),
  wide: T([[0, 0], [10.4, 0], [10.6, 0.6], [11.1, 0.2], [16.5, 0], [16.7, 0.6], [17.2, 0.2], [23.6, 0], [24, 0.7], [25, 0.4], [37.8, 0], [38.6, 0.8], [41, 0.5], [42, 0.9], [44.4, 0.8], [44.6, 0], [47.8, 0], [48.4, 0.6],
    [52.6, 0.3], [52.8, 0.9], [53.6, 0.5], [56, 0.8], [57.6, 0.5], [71.4, 0.4], [92.2, 0], [92.5, 1], [94.5, 0.6], [111.5, 0], [111.8, 1], [113.4, 0.6]]),
  squint: T([[0, 0], [25, 0], [25.4, 0.7], [26.6, 0.7], [27, 0.1], [29.6, 0.1], [30.1, 0.5], [30.6, 0.1], [36.4, 0.1], [36.8, 0.4], [44.6, 0.1], [45.2, 0.9], [46.8, 0.8], [47.2, 0.1], [74.3, 0], [74.4, 0.8], [74.8, 0.2],
    [94.8, 0], [95.6, 0.35], [97, 0.2], [113.4, 0], [113.8, 0.75], [117, 0.6]]),
  tears: T([[0, 0], [75.6, 0], [76.5, 0.45], [77.2, 0.3], [78, 0], [85.6, 0], [86.6, 0.6], [88, 1], [88.8, 0.9], [89.5, 0.55], [92, 0.5], [93, 0.35], [97, 0.25], [99, 0], [112.6, 0], [113.6, 0.85], [117, 0.8], [118.5, 0.45]]),
  sit: T([[0, 0], [23.4, 0], [23.9, 1], [24.4, 0.55], [24.7, 1], [26.6, 1], [27, 0], [41.6, 0], [42.4, 1], [44.8, 1], [45.6, 1], [46, 0.5], [46.4, 1], [47, 1], [53.3, 1], [53.7, 0], [75, 0], [75.6, 1], [77, 1], [77.4, 0],
    [94.3, 0], [94.8, 1], [97.1, 1], [97.4, 0], [110.6, 0], [111.4, 1], [DURATION + 1, 1]]),
  lie: T([[0, 0], [35.7, 0], [36.5, 1], [41.4, 1], [42.1, 0], [84.0, 0], [85.2, 1], [89.2, 1], [89.8, 0], [102.95, 0], [103.05, 1], [110.6, 1], [111.3, 0]]),
  crouch: T([[0, 0], [14.3, 0], [15.2, 1], [16.5, 1], [17.0, 0.45], [19, 0.45], [19.2, 0.7], [19.6, 0.45], [20.5, 0.6], [20.8, 1], [21.1, 0.4], [21.6, 0.12], [22.8, 0.12], [23.1, 0], [29.2, 0], [29.5, 0.35], [30.4, 0.35],
    [30.6, 0], [31.4, 0], [31.6, 0.6], [31.9, 0.1], [32.5, 0], [34.1, 0], [34.4, 0.4], [35.6, 0.4], [35.8, 0], [71.2, 0], [71.5, 0.55], [72.2, 0.55], [72.5, 0], [73.7, 0], [74.0, 0.6], [74.3, 0.6], [74.4, 0.05],
    [101.6, 0], [101.9, 0.15], [102.95, 0.15], [103.0, 0]]),
  beg: T([[0, 0], [95.0, 0], [95.7, 1], [97.0, 1], [97.3, 0]]),
  dig: T([[0, 0], [89.9, 0], [90.3, 1], [92.0, 1], [92.3, 0], [97.4, 0], [97.6, 0.8], [98.3, 0.8], [98.5, 0], [98.6, 0]]),
  hop: T([[0, 0], [24.3, 0], [24.45, 0.06, easeOut], [24.6, 0, easeIn], [45.7, 0], [45.85, 0.07, easeOut], [46.0, 0, easeIn], [46.1, 0.05, easeOut], [46.25, 0, easeIn], [111.9, 0], [112.05, 0.04, easeOut], [112.2, 0, easeIn]]),
  headPitch: T([[0, 0], [9.4, 0], [9.8, -0.15], [10.3, -0.1], [10.6, 0.05], [22, 0], [23.6, 0.15], [26.6, 0.2], [27, 0], [38, 0], [38.6, 0.25], [41, 0.35], [42, 0.75], [44.2, 0.65], [44.6, 0.1], [45.6, 0.2], [47, 0],
    [53.6, 0], [56, 0.15], [67.2, -0.1], [68.4, -0.2], [75, -0.3], [77, -0.2], [77.3, 0.1], [83.5, -0.15], [85.5, -0.05], [92.2, 0], [92.5, -0.2], [94.6, -0.2], [95.8, -0.15], [97, 0], [103, 0], [109.8, 0],
    [110.6, 0.1], [111.8, -0.25], [113.2, -0.25], [113.5, 0.1], [116, 0.05]]),
  headYaw: T([[0, 0], [9.4, 0], [9.8, -0.85], [10.1, -0.85], [10.35, 0.55], [10.6, 0.4], [11, 0], [53.6, 0], [66.6, 0], [67, -0.9], [67.4, -0.9], [67.7, 0.8], [68, 0.6], [68.6, 0], [74.5, 0], [74.6, -0.5], [75, 0]]),
  headRoll: T([[0, 0], [9.8, 0.1], [10.3, -0.1], [10.6, 0], [17.2, 0], [17.8, 0.2], [20, 0.2], [20.4, 0], [23.6, 0], [24.3, -0.25], [26.6, -0.2], [27, 0], [36.4, 0], [37, 0.3], [41, 0.1], [46, -0.2], [47, 0], [48, 0.2],
    [52.6, 0.15], [53, 0], [94.6, 0], [95.8, 0.25], [97, 0.2], [97.4, 0], [111.8, 0], [112.4, 0.2], [113.5, 0.25], [116, 0.12]]),
  lookW: T([[0, 0], [10.3, 0], [10.6, 1], [11.2, 1], [11.6, 0.3], [14, 0.6], [16.5, 0.6], [16.6, 1], [22.9, 1], [23.2, 1], [33.4, 1], [33.5, 1], [41.8, 1], [42, 0], [44.4, 0], [44.6, 0.8], [47, 1], [53.6, 1],
    [61.6, 0.6], [62, 0.8], [66.6, 1], [67, 0], [68.6, 0], [70.8, 0.8], [74.4, 1], [74.5, 0], [75.2, 0], [75.6, 0], [81, 0.3], [83.5, 1], [95.6, 1], [97, 1], [101.5, 1], [103, 1], [103.5, 0], [110.6, 0], [111.2, 1],
    [113.4, 1], [113.6, 0.3], [116, 0.7]]),
};
function foxLook(t, W) {
  const fh = W.flowerHead, dh = W.deerHead;
  if (t < 9.4) return null;
  if (t < 11.6) return gp(TREE_POS[0], TREE_POS[1], 0.6);
  if (t < 16.5) return gp(POOL[0], POOL[1], 0);
  if (t < 19.0) return fh;
  if (t < 19.8) return gp(POOL[0], POOL[1], 0);
  if (t < 27) return fh;
  if (t < 30.5) return t < 29.0 ? V.add(fh, [0, 0.05, 0]) : fh;
  if (t < 33.5) return gp(FLOWER_POS[0], FLOWER_POS[1], 0.18);
  if (t < 42) return fh;
  if (t < 44.6) return V.add(fh, [0, 0.5, 0]);
  if (t < 47) return W.camPos;
  if (t < 47.8) return fh;
  if (t < 53.6) return dh || fh;
  if (t < 54.3) return fh;
  if (t < 55.2) return dh || fh;
  if (t < 58.5) return gp(MEADOW[0], MEADOW[1], 6);
  if (t < 59.8) return fh;
  if (t < 67) return dh || gp(MEADOW[0], MEADOW[1], 3);
  if (t < 74.5) return t < 71.2 ? gp(MEADOW[0], MEADOW[1], 0.5) : t < 72.7 ? gp(FAKE_ONE[0], FAKE_ONE[1], 0.2) : gp(POND[0] - 1.2, POND[1], 0);
  if (t < 81) return gp(OASIS[0], OASIS[1], 0.2);
  if (t < 85.5) return fh;
  if (t < 89.2) return gp(FLOWER_POS[0], FLOWER_POS[1], 0.03);
  if (t < 94.6) return gp(SEED_FOUND[0], SEED_FOUND[1], 0);
  if (t < 97.6) return W.seedPos || gp(SEED_SPOT[0], SEED_SPOT[1], 0);
  if (t < 103) return gp(SEED_SPOT[0], SEED_SPOT[1], 0);
  if (t < 113.4) return W.sproutTop || gp(SEED_SPOT[0], SEED_SPOT[1], 0.03);
  return t < 116 ? W.camPos : W.sproutTop;
}
const FOX_FACE = { // turg‘un paytdagi yo‘nalish (heading) — [t, burchak], og‘irlik
  ang: T([[0, 1.1], [14.3, 0.78], [20.7, 0.78], [21.5, -0.85], [23, -0.85], [29.2, -0.55], [31.3, -2.2], [31.9, -2.2], [32.5, 0.9], [33.5, 0.9], [34.2, -1.9], [36.4, -2.1], [46.9, -2.1], [47, 1.9], [53.6, 1.9], [55.6, 2.3], [58, 2.3],
    [72.7, 2.2], [73.7, 1.5], [83.8, -0.95], [99.5, -0.95], [101.5, -1.6], [103, -0.1], [109.8, -0.1], [110.6, -1.2], [111.4, -1.55]]),
  w: T([[0, 0], [14.0, 0], [14.4, 1], [20.6, 1], [20.7, 0], [21.4, 0], [21.6, 1], [23, 1], [27, 0], [28.9, 0], [29.3, 1], [30.5, 1], [30.6, 0], [31.2, 0], [31.4, 1], [31.9, 1], [32.0, 0], [32.4, 0], [32.6, 1],
    [33.4, 1], [33.5, 0], [34.1, 0], [34.3, 1], [47, 1], [53.6, 1], [53.7, 0], [55.4, 0], [55.6, 1], [58, 1], [59.8, 1], [60, 0], [72.6, 0], [72.7, 1], [73.6, 1], [73.7, 0], [83.6, 0], [83.8, 1], [99.5, 1],
    [101.5, 1], [103, 1], [111.4, 1], [DURATION + 1, 1]]),
};
function foxState(t, W) {
  const m = sampleTable(FOX_TAB, t);
  const st = { pos: m.pos, heading: m.heading, moving: m.moving, phase: m.phase, gallop: smooth((m.speed - 1.3) / 0.5) };
  const fw = FOX_FACE.w.at(t);
  if (fw > 0) st.heading = angLerp(m.heading, FOX_FACE.ang.at(t), fw);
  for (const k in FX) st[k] = FX[k].at(t);
  st.look = foxLook(t, W);
  st.breathRate = t > 103 && t < 110 ? 1.3 : t < 11 ? 4.5 : 2.2; st.breathAmp = t < 11 ? 1.8 : 1;
  st.digPhase = t * 3.6;
  // gul ustidagi qumni panja bilan tozalash
  if (t > 34.3 && t < 35.7) { const w = pulse(t, 34.3, 34.6, 35.4, 35.7); st.pawReach = { side: 1, w, x: 0.03 + 0.03 * Math.sin(t * 9), z: 0.2, y: 0.03 + 0.015 * Math.sin(t * 9) }; }
  if (t > 98.3 && t < 99.4) { st.crouch = Math.max(st.crouch, pulse(t, 98.3, 98.6, 99.1, 99.4) * 0.9); }
  st.earTwitch = 1;
  // ko‘z yoshi tomchilari
  st.tearRoll = [];
  const roll = (t0, side, d = 1.3) => { const u = (t - t0) / d; if (u > 0 && u < 1) st.tearRoll.push({ side, u: easeIn(u) * 0.6 + u * 0.4 }); };
  roll(76.6, 1, 1.1); roll(87.0, 1); roll(87.7, -1, 1.2); roll(113.9, 1, 1.4); roll(114.6, -1, 1.5);
  if (t > 88.5 && t < 89.2) { st.wide = 0; }
  return st;
}
// ---------------- kiyik treklari ----------------
const DX = {
  vis: T([[0, 0], [46.9, 0], [47, 1], [68.3, 1], [68.4, 0]]),
  lids: T([[0, 0.35], [50, 0.25], [52, 0.35], [56.3, 0.55], [57.6, 0.45], [58, 0.3], [65, 0.25], [65.6, 0.5], [66.4, 0.35]]),
  sly: T([[0, 0.3], [51.9, 0.5], [56.3, 0.9], [58, 0.6], [65, 0.6], [65.4, 1], [66.4, 0.8]]),
  browSad: T([[0, 0], [52, 0.25], [52.6, 0.0]]),
  headPitch: T([[0, 0.1], [51.9, 0.1], [52.3, -0.45], [52.9, -0.1], [53, 0.0], [56.3, 0], [56.6, -0.75], [57.5, -0.7], [57.9, 0.1], [65, 0], [65.5, 0.15]]),
  crouch: T([[0, 0], [56.3, 0], [56.8, 1.15], [57.4, 1.15], [57.8, 0]]),
  headYaw: T([[0, 0], [52.9, 0], [53.2, 0], [65.0, 0], [65.3, 0]]),
  jaw: T([[0, 0], [56.9, 0], [57.0, 0.35], [57.25, 0], [57.6, 0]]),
  lookW: T([[0, 0.6], [49.5, 0.8], [52.9, 1], [53.0, 1], [53.6, 1], [55.2, 1], [56.3, 1], [56.4, 1], [57.6, 1], [58.4, 0.7], [61, 0.3], [65, 1], [66.3, 1], [66.5, 0]]),
  tailWag: T([[0, 0.5], [60, 1], [68, 1]]),
  earsBack: T([[0, 0], [56.3, 0.3], [57.6, 0.1]]),
};
function deerLook(t, W) {
  if (t < 52.9) return W.foxHead;
  if (t < 53.6) return gp(MEADOW[0], MEADOW[1], 4);
  if (t < 55.2) return W.foxHead;
  if (t < 57.6) return W.flowerHead;
  if (t < 58.4) return W.camPos;
  if (t < 65) return gp(MEADOW[0], MEADOW[1], 2);
  return W.foxHead;
}
const DEER_FACE = { ang: T([[47, 0], [51.9, -2.0], [53.6, -2.0], [56.3, -2.5], [58, -2.5], [65, -2.9], [66, -2.9]]), w: T([[47, 0], [51.8, 0], [52.0, 1], [53.5, 1], [53.6, 0], [56.2, 0], [56.3, 1], [58, 1], [58.2, 0], [64.9, 0], [65.1, 0.75], [66.0, 0.75], [66.2, 0]]) };
function deerState(t, W) {
  const m = sampleTable(DEER_TAB, t);
  const st = { pos: m.pos, heading: m.heading, moving: m.moving, phase: m.phase, gallop: smooth((m.speed - 2.0) / 0.6) };
  const fw = DEER_FACE.w.at(t);
  if (fw > 0) st.heading = angLerp(m.heading, DEER_FACE.ang.at(t), fw);
  for (const k in DX) st[k] = DX[k].at(t);
  st.look = deerLook(t, W); st.earTwitch = 1; st.breathRate = 1.8;
  return st;
}
// ---------------- gul treklari ----------------
const FL = {
  health: T([[0, 0.12], [22.2, 0.12], [23.5, 0.35], [26.2, 1], [58, 1], [61, 0.9], [68, 0.55], [78, 0.25], [81, 0], [DURATION + 1, 0]]),
  open: T([[0, 0.12], [23.6, 0.12], [26.4, 0.5], [37.5, 0.5], [41.2, 1], [58, 1], [61, 0.85], [78, 0.7], [81, 0.55]]),
  droop: T([[0, 0.65], [22.4, 0.65], [25.2, 0.0], [58.2, 0], [61, 0.12], [68, 0.3], [78, 0.6], [81, 0.92], [DURATION + 1, 0.92]]),
  wilt: T([[0, 0.2], [22.5, 0.2], [24, 0], [78, 0.3], [80.5, 1], [DURATION + 1, 1]]),
  fallen: T([[0, 0], [80, 0], [81, 0.82], [86.0, 0.82], [86.4, 1]]),
  glow: T([[0, 0], [36.8, 0], [39.5, 0.6], [41.5, 1.0], [45, 0.9], [47, 0.35], [48, 0.06], [58, 0.03], [60, 0]]),
  seeds: T([[0, 0], [43.5, 0], [44.5, 1], [57.05, 1], [57.2, 0]]),
  bow: T([[0, 0], [25.6, 0], [26.4, 0.25], [27, 0.1], [35.9, 0.1], [36.8, 0.55], [38, 0.3], [58, 0], [59.2, 0], [59.8, 0.35], [61, 0.2]]),
  sand: T([[0, 0], [33.7, 0], [34.3, 0.75], [34.8, 0.5], [35.6, 0.0]]),
  shiver: T([[0, 0], [57.0, 0], [57.1, 1], [57.5, 0], [85.7, 0], [85.8, 1], [86.3, 0]]),
};
function flowerState(t, W) {
  const fs = {};
  for (const k in FL) fs[k] = FL[k].at(t);
  // gul tulki tomonga "qaraydi"
  let fy = 0.7;
  if (t > 25 && t < 47) fy = -2.4 + (t > 33.5 ? 0.9 : 0);
  if (t > 58 && t < 62) fy = 0.85;
  fs.lookYaw = fy;
  return fs;
}

// ---------------- kamera ----------------
function camLook(pos, tgt, fov, focus, ap) { return { pos, tgt, fov: fov * DEG, focus: focus == null ? V.dist(pos, tgt) : focus, ap: ap == null ? 0.6 : ap }; }
const above = (p, h) => [p[0], p[1] + h, p[2]];
const fromHead = (W, back, side, up, H0) => { // tulki orqasidan/yonidan nisbiy pozitsiya
  const f = W.foxFwd, r = W.foxRgt, h = W.foxHead;
  return V.add(h, V.add(V.mul(f, -back), V.add(V.mul(r, side), [0, up, 0])));
};
const SHOTS = [
  // ===== 1-SAHNA: YOLG‘IZLIK =====
  { t0: 0, t1: 5.2, cam: (t, W) => { const u = smoother(t / 5.2); const f = W.foxRoot; const p = V.add(f, V.lerp([-9, 7.5, 13], [-4.2, 1.1, 3.6], u)); p[1] = Math.max(p[1], H(p[0], p[2]) + lerp(4, 0.9, u)); return camLook(p, V.lerp(V.add(f, [4, 0.5, -3]), V.add(W.foxHead, [0, 0.05, 0]), u), lerp(42, 30, u), null, 0.12); } },
  { t0: 5.2, t1: 8.6, cam: (t, W) => { const u = (t - 5.2) / 3.4; const p = V.add(W.foxRoot, V.add(V.mul(W.foxRgt, -1.35 + u * 0.15), V.add(V.mul(W.foxFwd, 0.55 - u * 0.25), [0, 0.32, 0]))); return camLook(p, V.add(W.foxHead, [0, -0.04, 0]), 26, null, 0.9); }, shake: 0.004 },
  { t0: 8.6, t1: 11, cam: (t, W) => { const u = (t - 8.6) / 2.4; const p = V.add(W.foxRoot, V.add(V.mul(W.foxFwd, 0.62 - u * 0.08), V.add(V.mul(W.foxRgt, -0.22 + u * 0.12), [0, 0.27, 0]))); return camLook(p, V.add(W.foxHead, [0, 0.0, 0]), 30, null, 1.2); }, shake: 0.003 },
  // ===== 2-SAHNA: SO‘NGGI SUV =====
  { t0: 11, t1: 14.2, cam: (t, W) => { const u = smoother((t - 11) / 3.2); const p = V.add(W.foxRoot, V.add(V.mul(W.foxFwd, -0.95 + u * 0.2), V.add(V.mul(W.foxRgt, 0.38), [0, 0.3, 0]))); return camLook(p, V.lerp(V.add(W.foxHead, [0, 0.02, 0]), gp(TREE_POS[0], TREE_POS[1], 0.35), 0.55 - u * 0.25), 36, V.dist(p, W.foxHead) + 0.4, 0.45); }, shake: 0.006 },
  { t0: 14.2, t1: 16.5, cam: (t, W) => { const u = smoother((t - 14.2) / 2.3); const c = V.add(gp(POOL[0], POOL[1], 0), [0.42 - u * 0.05, 0.3 - 0.08 * u, 0.5 - u * 0.06]); return camLook(c, V.add(W.foxHead, [0, -0.03, 0]), lerp(32, 27, u), null, 1.2); } },
  { t0: 16.5, t1: 18.6, cam: (t, W) => { const u = smoother((t - 16.5) / 2.1); const fh = W.flowerHead; const away = V.norm(V.sub(fh, W.foxHead)); const p = V.add(fh, V.add(V.mul(away, 0.3 - u * 0.04), [-away[2] * 0.09, 0.05, away[0] * 0.09])); return camLook(p, V.lerp(W.foxHead, fh, 0.35 + 0.2 * u), 30, lerp(V.dist(p, W.foxHead), V.dist(p, fh), smooth((t - 16.9) / 0.9)), 2.6); } },
  { t0: 18.6, t1: 20.6, cam: (t, W) => { const u = (t - 18.6) / 2; const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.4), V.add(V.mul(W.foxRgt, 0.22 - u * 0.06), [0, -0.07, 0]))); return camLook(p, V.add(W.foxHead, [0, -0.01, 0]), 30, null, 1.6); }, shake: 0.002 },
  { t0: 20.6, t1: 23, cam: (t, W) => { const u = smoother((t - 20.6) / 2.4); const c = gp(FLOWER_POS[0], FLOWER_POS[1], 0); const p = V.add(c, [lerp(0.95, 0.7, u), 0.34, lerp(0.55, 0.42, u)]); return camLook(p, V.lerp(V.add(c, [0.1, 0.12, -0.1]), V.add(c, [0.05, 0.1, -0.05]), u), 30, null, 1.0); } },
  // ===== 3-SAHNA: MEHR =====
  { t0: 23, t1: 25.2, cam: (t, W) => { const u = smoother((t - 23) / 2.2); const c = W.flowerHead; const p = V.add(gp(FLOWER_POS[0], FLOWER_POS[1], 0), [0.22 - u * 0.04, 0.07 + u * 0.08, 0.2]); return camLook(p, V.add(c, [0, -0.02 + u * 0.01, 0]), 30, null, 2.2); } },
  { t0: 25.2, t1: 27, cam: (t, W) => { const u = (t - 25.2) / 1.8; const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.5 - u * 0.06), V.add(V.mul(W.foxRgt, -0.2), [0, -0.03, 0]))); return camLook(p, W.foxHead, 30, null, 1.5); }, shake: 0.002 },
  { t0: 27, t1: 30.5, trans: 'dissolve', td: 0.9, cam: (t, W) => { const u = smoother((t - 27) / 3.5); return camLook(V.add(gp(-1.6, 0.9, 0), [0, 0.42 + u * 0.05, 0]), V.lerp(V.add(W.foxHead, [0, -0.05, 0]), gp(0.0, 0.2, 0.12), u * 0.6), 30, null, 0.8); } },
  { t0: 30.5, t1: 33.5, trans: 'dissolve', td: 0.8, cam: (t, W) => { const u = (t - 30.5) / 3; const a = 2.6 + u * 0.7; const c = gp(FLOWER_POS[0], FLOWER_POS[1], 0.12); return camLook(V.add(c, [Math.cos(a) * 1.25, 0.42, Math.sin(a) * 1.25]), c, 32, null, 0.7); } },
  { t0: 33.5, t1: 37, trans: 'dissolve', td: 0.8, cam: (t, W) => { const u = smoother((t - 33.5) / 3.5); const c = gp(FLOWER_POS[0], FLOWER_POS[1], 0.08); const a = 2.25 + u * 0.3; return camLook(V.add(c, [Math.cos(a) * (0.85 - u * 0.15), 0.2 - u * 0.06, Math.sin(a) * (0.85 - u * 0.15)]), V.lerp(c, W.foxHead, 0.4), 30, null, 1.1); } },
  // ===== 4-SAHNA: MO‘JIZA =====
  { t0: 37, t1: 41.2, trans: 'blend', td: 1.0, cam: (t, W) => { const u = (t - 37) / 4.2; const c = W.flowerHead; const a = 0.7 + u * 0.9; return camLook(V.add(c, [Math.cos(a) * (0.4 - u * 0.1), 0.03 + u * 0.04, Math.sin(a) * (0.4 - u * 0.1)]), V.add(c, [0, 0.01, 0]), 32, null, 2.0); } },
  { t0: 41.2, t1: 44.4, cam: (t, W) => { const u = smoother((t - 41.2) / 3.2); const c = gp(FLOWER_POS[0], FLOWER_POS[1], 0.15); return camLook(V.add(c, [lerp(1.0, 1.3, u), lerp(0.12, 0.35, u), lerp(0.75, 1.05, u)]), V.lerp(V.add(c, [0, 0.12, 0]), V.add(W.foxHead, [0, 0.08, 0]), 0.45), 36, null, 0.9); } },
  { t0: 44.4, t1: 47, cam: (t, W) => { const u = (t - 44.4) / 2.6; if (t < 45.9) { const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.4), V.add(V.mul(W.foxRgt, 0.12), [0, -0.03, 0]))); return camLook(p, W.foxHead, 30, null, 1.6); } const w = smoother((t - 45.9) / 1.1); const c = gp(0, 0.3, 0.15); return camLook(V.add(c, [lerp(-0.6, -2.4, w), lerp(0.15, 0.9, w), lerp(-0.7, -2.5, w)]), V.lerp(W.foxHead, c, w), 34, null, 0.8); } },
  // ===== 5-SAHNA: VASVASA =====
  { t0: 47, t1: 50.6, trans: 'dissolve', td: 1.0, cam: (t, W) => { const u = smoother((t - 47) / 3.6); const dd = V.norm(V.sub(W.deerRoot, W.foxRoot)); const pp = [-dd[2], 0, dd[0]]; const p = V.add(W.foxRoot, V.add(V.mul(dd, -0.75), V.add(V.mul(pp, 0.28), [0, 0.2, 0]))); return camLook(p, V.lerp(V.lerp(W.foxHead, W.deerHead, 0.75), V.lerp(W.foxHead, W.deerHead, 0.55), u), lerp(26, 30, u), V.dist(p, W.deerHead), 0.45); } },
  { t0: 50.6, t1: 53.6, cam: (t, W) => { const u = (t - 50.6) / 3; const mid = V.lerp(W.foxHead, W.deerHead, 0.5); const p = V.add(mid, [0.15 - u * 0.1, 0.02, 2.2 - u * 0.15]); const tg = t < 52.8 ? V.add(mid, [0, -0.08, 0]) : V.lerp(V.add(mid, [0, -0.08, 0]), V.add(mid, [1.6, 0.2, -1.0]), smoother((t - 52.8) / 0.8)); return camLook(p, tg, 34, t < 52.8 ? null : V.dist(p, W.deerHead), 0.8); } },
  { t0: 53.6, t1: 56.2, cam: (t, W) => { const u = (t - 53.6) / 2.6; if (t < 54.8) { const p = V.add(W.foxHead, [-0.7, 0.04, -0.15]); return camLook(V.add(p, [0, 0, 0]), V.add(W.foxHead, [1.2, 0.18, -0.65]), 30, 9, 0.9); } const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.55), V.add(V.mul(W.foxRgt, 0.15), [0, 0.0, 0]))); return camLook(p, W.foxHead, 30, null, 1.8); } },
  { t0: 56.2, t1: 58, cam: (t, W) => { const u = smoother((t - 56.2) / 1.8); const fh = W.flowerHead; const p = V.add(fh, [lerp(0.46, 0.4, u), lerp(0.06, 0.1, u), lerp(-0.02, 0.04, u)]); return camLook(p, V.lerp(fh, W.deerHead, t < 57.4 ? 0.35 : 0.35 + 0.65 * smooth((t - 57.4) / 0.4)), 34, null, 1.2); } },
  // ===== 6-SAHNA: XATO =====
  { t0: 58, t1: 61.5, cam: (t, W) => { const u = smoother((t - 58) / 3.5); const fh = W.flowerHead; const p = V.add(gp(FLOWER_POS[0], FLOWER_POS[1], 0), [-0.4, 0.12 + u * 0.05, 0.45]); return camLook(p, V.lerp(V.add(fh, [0.4, 0.05, -0.4]), V.add(W.foxRoot, [0, 0.15, 0]), 0.6 + 0.4 * u), 30, lerp(V.dist(p, W.foxHead), V.dist(p, W.foxHead), u), 0.8); } },
  { t0: 61.5, t1: 65.2, trans: 'dissolve', td: 1.0, cam: (t, W) => { const u = (t - 61.5) / 3.7; const p = V.add(W.foxRoot, [-1.8 + u * 0.3, 0.25, 3.6]); return camLook(V.add(p, [0, Math.max(0, H(p[0], p[2]) - p[1] + 0.35), 0]), V.lerp(W.foxRoot, W.deerRoot, 0.45), 38, null, 0.3); } },
  { t0: 65.2, t1: 66.3, cam: (t, W) => { const p = V.add(W.deerHead, [-0.35, -0.02, 0.5]); return camLook(p, W.deerHead, 30, null, 1.6); } },
  { t0: 66.3, t1: 68, cam: (t, W) => { const u = smoother((t - 66.3) / 1.7); const p = V.add(W.foxRoot, [-1.3 - u * 0.9, 0.35 + u * 0.5, 1.6 + u * 1.0]); return camLook(p, V.add(W.foxRoot, [0, 0.2, 0]), 34, null, 0.5); } },
  // ===== 7-SAHNA: HAQIQAT =====
  { t0: 68, t1: 71.2, trans: 'dissolve', td: 1.0, cam: (t, W) => { const u = smoother((t - 68) / 3.2); const p = V.add(W.foxRoot, V.add(V.mul(W.foxFwd, -1.3 + u * 0.4), [0.25, 0.38, 0])); return camLook(p, V.lerp(V.add(W.foxHead, [3, 0.2, -1.8]), V.add(W.foxHead, [0, -0.02, 0]), u * 0.6), 36, null, 0.4); } },
  { t0: 71.2, t1: 73.7, cam: (t, W) => { const u = (t - 71.2) / 2.5; const c = gp(FAKE_ONE[0], FAKE_ONE[1], 0.25); return camLook(V.add(c, [0.35 - u * 0.05, 0.02, 0.38]), V.lerp(c, W.foxHead, 0.55), 34, null, 1.1); } },
  { t0: 73.7, t1: 75.4, cam: (t, W) => { const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.45), V.add(V.mul(W.foxRgt, -0.25), [0, -0.05, 0]))); return camLook(p, W.foxHead, 30, null, 1.4); }, shake: 0.003 },
  { t0: 75.4, t1: 78, cam: (t, W) => { const u = smoother((t - 75.4) / 2.6); const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.7 - u * 0.2), V.add(V.mul(W.foxRgt, 0.35), [0, 0.05, 0]))); return camLook(p, W.foxHead, 30, null, 1.2); },
    memory: { t0: 75.6, t1: 77.4, a: 0.62 } },
  // ===== 8-SAHNA: KECHIKKAN PUSHAYMON =====
  { t0: 78, t1: 81, trans: 'dissolve', td: 1.0, cam: (t, W) => { const p = V.add(W.foxRoot, V.add(V.mul(W.foxRgt, 1.6), V.add(V.mul(W.foxFwd, 0.6), [0, 0.3, 0]))); return camLook(V.add(p, [0, Math.max(0, H(p[0], p[2]) + 0.25 - p[1]), 0]), W.foxHead, 34, null, 0.5); }, shake: 0.006 },
  { t0: 81, t1: 84.2, cam: (t, W) => { const u = smoother((t - 81) / 3.2); const c = gp(FLOWER_POS[0], FLOWER_POS[1], 0.1); return camLook(V.add(c, [lerp(-1.6, -1.2, u), lerp(0.55, 0.4, u), lerp(-1.4, -1.0, u)]), V.lerp(V.add(W.foxRoot, [0, 0.2, 0]), c, 0.4 + 0.3 * u), 34, null, 0.6); } },
  { t0: 84.2, t1: 86.6, cam: (t, W) => { const u = smoother((t - 84.2) / 2.4); const c = V.lerp(W.foxHead, W.flowerHead, 0.5); return camLook(V.add(c, [lerp(-0.55, -0.45, u), lerp(0.08, 0.02, u), lerp(0.25, 0.22, u)]), c, 32, null, 1.6); } },
  { t0: 86.6, t1: 89, cam: (t, W) => { const u = (t - 86.6) / 2.4; const e = W.foxEye || W.foxHead; const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.3 - u * 0.03), V.add(V.mul(W.foxRgt, 0.2), [0, -0.04, 0]))); return camLook(p, V.lerp(e, W.foxHead, 0.3), 30, null, 2.0); } },
  // ===== 9-SAHNA: OXIRGI UMID =====
  { t0: 89, t1: 92.2, cam: (t, W) => { const u = (t - 89) / 3.2; const c = gp(SEED_FOUND[0], SEED_FOUND[1], 0.1); return camLook(V.add(c, [-0.75 + u * 0.1, 0.25, 0.35]), V.lerp(W.foxHead, c, 0.45), 32, null, 1.0); } },
  { t0: 92.2, t1: 94.6, cam: (t, W) => { const u = smoother((t - 92.2) / 2.4); const c = gp(SEED_FOUND[0], SEED_FOUND[1], 0.0); return camLook(V.add(c, [lerp(-0.2, -0.15, u), lerp(0.08, 0.06, u), lerp(0.16, 0.12, u)]), V.add(c, [0, 0.008, 0]), 30, null, 2.6); } },
  { t0: 94.6, t1: 97, cam: (t, W) => { const u = smoother((t - 94.6) / 2.4); const pm = W.foxPawsMid || W.foxHead; const p = V.add(pm, V.add(V.mul(W.foxFwd, lerp(0.42, 0.32, u)), V.add(V.mul(W.foxRgt, -0.12), [0, 0.0, 0]))); return camLook(p, V.lerp(W.foxHead, pm, 0.45), 32, null, 1.4); } },
  // ===== 10-SAHNA: YANGI HAYOT =====
  { t0: 97, t1: 99.5, cam: (t, W) => { const u = (t - 97) / 2.5; const c = gp(SEED_SPOT[0], SEED_SPOT[1], 0.05); return camLook(V.add(c, [-0.5 + u * 0.08, 0.2, -0.45]), V.lerp(c, W.foxHead, 0.4), 32, null, 1.1); } },
  { t0: 99.5, t1: 101.5, trans: 'dissolve', td: 0.8, cam: (t, W) => { const u = (t - 99.5) / 2; const p = V.add(W.foxRoot, [6.5 - u * 0.5, 1.2, -3.5]); return camLook(V.add(p, [0, Math.max(0, H(p[0], p[2]) + 0.8 - p[1]), 0]), V.add(W.foxRoot, [0, 0.4, 0]), 40, null, 0.2); } },
  { t0: 101.5, t1: 103, trans: 'dissolve', td: 0.7, cam: (t, W) => { const c = gp(SEED_SPOT[0], SEED_SPOT[1], 0.08); return camLook(V.add(c, [-0.35, 0.18, -0.42]), V.lerp(c, W.foxHead, 0.5), 32, null, 1.2); } },
  { t0: 103, t1: 106.4, trans: 'dissolve', td: 1.0, cam: (t, W) => { const u = smoother((t - 103) / 3.4); const c = gp(SEED_SPOT[0] + 0.07, SEED_SPOT[1], 0.05); return camLook(V.add(c, [lerp(-0.9, -0.55, u), lerp(0.75, 0.45, u), lerp(-0.6, -0.35, u)]), c, 34, null, 0.9); } },
  { t0: 106.4, t1: 109, cam: (t, W) => { const u = (t - 106.4) / 2.6; const c = gp(SEED_SPOT[0] + 0.06, SEED_SPOT[1], 0.08); return camLook(V.add(c, [-0.45 + u * 0.05, 0.1, 0.32]), V.lerp(c, W.foxHead, 0.5), 32, null, 1.3); }, shake: 0.008 },
  // ===== 11-SAHNA: YAKUN =====
  { t0: 109, t1: 113.2, trans: 'dissolve', td: 1.2, cam: (t, W) => { const u = smoother((t - 109) / 4.2); const c = gp(SEED_SPOT[0], SEED_SPOT[1], 0.02); return camLook(V.add(c, [lerp(-0.32, -0.24, u), lerp(0.1, 0.08, u), lerp(-0.3, -0.22, u)]), V.lerp(V.lerp(V.add(c, [0.1, 0.07, 0.05]), W.foxHead, 0.3), V.lerp(V.add(c, [0.04, 0.06, 0.02]), W.foxHead, 0.4), u), 34, V.dist(V.add(c, [-0.28, 0.09, -0.26]), c), 1.4); } },
  { t0: 113.2, t1: 116, cam: (t, W) => { const u = (t - 113.2) / 2.8; const p = V.add(W.foxHead, V.add(V.mul(W.foxFwd, 0.42 - u * 0.05), V.add(V.mul(W.foxRgt, 0.2), [0, -0.01, 0]))); return camLook(p, W.foxHead, 28, null, 1.8); } },
  { t0: 116, t1: DURATION + 1, cam: (t, W) => { const u = smoother((t - 116) / 8); const c = gp(SEED_SPOT[0] + 0.05, SEED_SPOT[1], 0.1); const r = lerp(0.9, 9, u), a = 3.6 + u * 0.5; return camLook(V.add(c, [Math.cos(a) * r, lerp(0.3, 4.8, Math.pow(u, 1.2)), Math.sin(a) * r]), V.lerp(c, V.add(c, [0, 0.2, 0]), u), lerp(34, 40, u), null, lerp(0.8, 0.1, u)); } },
];
function shotAt(t) { let i = 0; while (i < SHOTS.length - 1 && SHOTS[i + 1].t0 <= t) i++; return i; }

// =====================================================================
//  08 · OVOZ: brauzerda sintez qilingan musiqa (pianino, torli pad,
//       nay, dutor terimi, qo‘ng‘iroqchalar) va tabiat tovushlari
//       (shamol, qum, suv, tomchilar, qadamlar, chigirtkalar, bo‘ron)
//       Hammasi OfflineAudioContext'da oldindan "yoziladi".
// =====================================================================
const NOTE_I = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function nf(n) { // 'F#4' -> Hz
  if (typeof n === 'number') return n;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); let s = NOTE_I[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (s + (parseInt(m[3]) + 1) * 12 - 69) / 12);
}
function buildSoundtrack(ctx, dur) {
  const sr = ctx.sampleRate, rnd = mulberry32(2024);
  const master = ctx.createGain(); master.gain.value = 2.3;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp); comp.connect(ctx.destination);
  // ---- reverb (sun’iy impuls) ----
  const irLen = Math.floor(sr * 3.6), ir = ctx.createBuffer(2, irLen, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) { const x = i / irLen; d[i] = (rnd() * 2 - 1) * Math.pow(1 - x, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); } }
  const rev = ctx.createConvolver(); rev.buffer = ir; const revG = ctx.createGain(); revG.gain.value = 0.55; rev.connect(revG); revG.connect(master);
  const music = ctx.createGain(); music.gain.value = 0.62; music.connect(master);
  const musicSend = ctx.createGain(); musicSend.gain.value = 0.55; music.connect(musicSend); musicSend.connect(rev);
  const sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
  const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.18; sfx.connect(sfxSend); sfxSend.connect(rev);
  // ---- shovqin buferlari ----
  const mkNoise = (secs, kind) => {
    const n = Math.floor(sr * secs), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
      else d[i] = w;
    }
    return b;
  };
  const WHITE = mkNoise(3, 'white'), PINK = mkNoise(6, 'pink'), BROWN = mkNoise(6, 'brown');
  const src = (buf, t0, t1, loop = true) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.start(Math.max(0, t0), rnd() * 2); s.stop(t1); return s; };
  const env = (g, t, a, d, peak, sus = 0) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); if (sus) g.gain.setValueAtTime(peak, t + a + sus); g.gain.exponentialRampToValueAtTime(0.0001, t + a + sus + d); };
  const pan = (node, p) => { if (!ctx.createStereoPanner) return node; const pn = ctx.createStereoPanner(); pn.pan.value = p; node.connect(pn); return pn; };
  // ---------------- cholg‘ular ----------------
  function piano(t, n, vel = 0.5, len = 2.5, p = 0) {
    const f = nf(n), out = ctx.createGain(); env(out, t, 0.006, len, vel * 0.22);
    [[1, 1], [2.001, 0.42], [3.003, 0.18], [4.01, 0.09], [5.02, 0.04]].forEach(([h, a], i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h; o.detune.value = (i ? 2 : 0);
      const g = ctx.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + len / (1 + i * 0.8));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.1);
    });
    pan(out, p).connect(music);
  }
  function pad(t, len, notes, vol = 0.12, cutoff = 1200, att = 1.6, rel = 2.2, type = 'sawtooth') {
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + att); out.gain.setValueAtTime(vol, t + Math.max(att, len - rel)); out.gain.linearRampToValueAtTime(0, t + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4; lp.connect(out);
    for (const n of notes) for (const dt of [-7, 0, 6]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = nf(n); o.detune.value = dt + (rnd() - 0.5) * 3;
      const g = ctx.createGain(); g.gain.value = 0.18 / notes.length; o.connect(g); g.connect(lp); o.start(t); o.stop(t + len + 0.05);
    }
    out.connect(music);
  }
  function flute(t, len, n, vol = 0.1, p = 0, bend = 0) {
    const f = nf(n), o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * (bend ? Math.pow(2, -bend / 12) : 1), t); if (bend) o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.6, len * 0.6)); vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.12); g.gain.setValueAtTime(vol * 0.9, t + Math.max(0.12, len - 0.25)); g.gain.linearRampToValueAtTime(0, t + len);
    const g2 = ctx.createGain(); g2.gain.value = 0.12; o.connect(g); o2.connect(g2); g2.connect(g);
    // nafas shovqini
    const br = src(WHITE, t, t + len); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; const bg = ctx.createGain(); bg.gain.value = 0.07; br.connect(bp); bp.connect(bg); bg.connect(g);
    pan(g, p).connect(music);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + len + 0.05); });
  }
  function bell(t, n, vol = 0.08, dec = 2.2, p = 0) {
    const f = nf(n), out = ctx.createGain(); out.gain.value = vol;
    [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.2, 0.3], [8.9, 0.08, 0.2]].forEach(([h, a, dd]) => {
      if (f * h > 17000) return;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dec * dd);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.1);
    });
    pan(out, p).connect(music);
  }
  function pluck(t, n, vol = 0.1, dec = 0.9, p = 0, bright = 2600) {
    const f = nf(n), o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 1.003;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dec * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
    const g2 = ctx.createGain(); g2.gain.value = 0.3; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); pan(g, p).connect(music);
    o.start(t); o2.start(t); o.stop(t + dec + 0.05); o2.stop(t + dec + 0.05);
  }
  function strings(t, len, notes, vol = 0.1, att = 1.2, cutoff = 2200) { pad(t, len, notes, vol, cutoff, att, Math.min(2.5, len * 0.4), 'sawtooth'); }
  function drone(t, len, n, vol = 0.12) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = nf(n);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = nf(n) * 2.003;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 2); g.gain.setValueAtTime(vol, t + len - 2); g.gain.linearRampToValueAtTime(0, t + len);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(music);
    o.start(t); o2.start(t); o.stop(t + len); o2.stop(t + len);
  }
  function thump(t, vol = 0.3, f = 55) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = ctx.createGain(); env(g, t, 0.005, 0.35, vol); o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.5);
  }
  const seq = (t0, step, notes, fn) => notes.forEach((n, i) => { if (n) fn(t0 + i * step, n, i); });
  const mel = (t0, list, fn) => { let t = t0; for (const [n, d] of list) { if (n) fn(t, n, d); t += d; } };
  // ---------------- tovush effektlari ----------------
  function noiseHit(t, len, f, q, vol, type = 'bandpass', p = 0, buf = WHITE) {
    const s = src(buf, t, t + len + 0.05); const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); env(g, t, Math.min(0.01, len * 0.2), len, vol); s.connect(bp); bp.connect(g); pan(g, p).connect(sfx);
  }
  function drip(t, vol = 0.15, f = 1400, p = 0) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.09);
    const g = ctx.createGain(); env(g, t, 0.002, 0.12, vol); o.connect(g); pan(g, p).connect(sfx); o.start(t); o.stop(t + 0.2);
  }
  function trickle(t0, t1, vol = 0.12) {
    const s = src(WHITE, t0, t1); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    for (let t = t0; t < t1; t += 0.05) bp.frequency.setValueAtTime(900 + rnd() * 1600, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.1); g.gain.setValueAtTime(vol, t1 - 0.15); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(bp); bp.connect(g); g.connect(sfx);
    for (let t = t0 + 0.05; t < t1; t += 0.07 + rnd() * 0.08) drip(t, 0.05 + rnd() * 0.04, 900 + rnd() * 1400, (rnd() - 0.5) * 0.4);
  }
  function step(t, vol, deer) { noiseHit(t, deer ? 0.09 : 0.06, deer ? 700 : 2200, deer ? 1.2 : 0.9, vol, 'bandpass', 0, PINK); if (deer) thump(t, vol * 0.35, 90); }
  // ---- shamol: muhit treki bo‘yicha avtomatlashtirish ----
  {
    const s = src(BROWN, 0, dur); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    const s2 = src(PINK, 0, dur); const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 0.8; const g2 = ctx.createGain(); g2.gain.value = 0;
    for (let t = 0; t <= dur; t += 0.25) {
      const e = envAt(t), w = Math.hypot(e.wind[0], e.wind[2]);
      const gust = 0.75 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3 + 1);
      const meadow = t > 68.3 && t < 77.8 ? 0.15 : 1;
      g.gain.linearRampToValueAtTime(Math.min(0.6, (0.04 + w * 0.13) * gust * meadow), t);
      bp.frequency.linearRampToValueAtTime(260 + w * 260 * gust, t);
      g2.gain.linearRampToValueAtTime(Math.min(0.25, e.sand * 0.05 * gust + (w > 2 ? 0.06 : 0)) * meadow, t);
    }
    s.connect(bp); bp.connect(g); g.connect(sfx); s2.connect(hp); hp.connect(g2); g2.connect(sfx);
  }
  // ---- qadamlar: yurish jadvalidan ----
  const footsteps = (tab, deer, vis) => {
    for (const leg of tab) {
      let lastHalf = null;
      for (const r of leg.rows) {
        if (vis && !vis(r.t)) continue;
        const half = Math.floor(r.ph * 2);
        if (lastHalf !== null && half !== lastHalf && r.sp > 0.08) step(r.t, clamp(0.05 + r.sp * 0.05, 0, deer ? 0.25 : 0.16), deer);
        lastHalf = half;
      }
    }
  };
  footsteps(FOX_TAB, false); footsteps(DEER_TAB, true, t => DX.vis.at(t) > 0.5);
  // ---- chigirtkalar (tunda) ----
  const crickets = (t0, t1, vol) => { for (let t = t0; t < t1; t += 0.55 + rnd() * 0.5) { const f = 4300 + rnd() * 500, p = (rnd() - 0.5) * 1.2; for (let k = 0; k < 3; k++) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); env(g, t + k * 0.045, 0.004, 0.03, vol); o.connect(g); pan(g, p).connect(sfx); o.start(t + k * 0.045); o.stop(t + k * 0.045 + 0.06); } } };
  crickets(38.5, 46.5, 0.012); crickets(83, 99.2, 0.016); crickets(103.4, 106.4, 0.016);
  // ---- pashshalar (sun’iy o‘tloqda) ----
  {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 205; const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 600; lp.Q.value = 1; const g = ctx.createGain(); g.gain.value = 0;
    [[68.6, 0], [69.6, 0.025], [72, 0.015], [73.8, 0.035], [76, 0.02], [77.8, 0]].forEach(([t, v]) => g.gain.linearRampToValueAtTime(v, t));
    o.connect(lp); lp.connect(g); pan(g, 0.3).connect(sfx); o.start(68); lfo.start(68); o.stop(78.5); lfo.stop(78.5);
  }
  // ---- aniq tovushlar ----
  [15.3, 15.75, 16.15].forEach(t => { noiseHit(t, 0.08, 1800, 3, 0.12); drip(t + 0.03, 0.06, 1100); }); // suv yalash
  trickle(21.9, 22.8, 0.1); trickle(29.45, 30.35, 0.12); trickle(101.9, 102.9, 0.12);
  drip(20.85, 0.12, 1000); drip(29.3, 0.08, 1200);
  for (let t = 38.5; t < 46.5; t += 0.18 + rnd() * 0.35) bell(t, 1800 + rnd() * 1600, 0.018, 1.4, (rnd() - 0.5) * 1.4); // sehrli tomchilar
  drip(44.62, 0.2, 1700); bell(44.62, 'A6', 0.05, 2.5);
  noiseHit(31.75, 0.08, 1500, 1, 0.1); noiseHit(32.55, 0.08, 1300, 1, 0.1); noiseHit(33.0, 0.25, 2500, 0.6, 0.06); // tayoqchalar
  [34.4, 34.7, 35.0, 35.3].forEach(t => noiseHit(t, 0.2, 3000, 0.7, 0.07, 'bandpass', 0, PINK)); // qumni supurish
  [34.8, 35.4].forEach(t => noiseHit(t, 0.35, 900, 0.5, 0.05)); // puflash
  noiseHit(57.05, 0.12, 2400, 2, 0.06); drip(57.6, 0.05, 2600); // urug‘ o‘g‘irlanishi
  [71.6, 71.9, 72.15, 89.6, 89.9, 91.9, 92.1].forEach(t => noiseHit(t, 0.09, 2500, 1.5, 0.07)); // hidlash
  noiseHit(72.32, 0.05, 3200, 4, 0.18); noiseHit(72.36, 0.12, 700, 3, 0.08); // plastik gul yiqilishi
  for (let t = 90.3; t < 92; t += 0.14) noiseHit(t, 0.12, 2600 + rnd() * 900, 0.8, 0.08, 'bandpass', 0, PINK); // kovlash
  for (let t = 97.6; t < 98.3; t += 0.14) noiseHit(t, 0.12, 2600 + rnd() * 900, 0.8, 0.07, 'bandpass', 0, PINK);
  bell(92.35, 'E6', 0.06, 3); bell(92.5, 'B6', 0.04, 3); // urug‘ topildi
  bell(111.0, 'C6', 0.05, 3); bell(111.3, 'G6', 0.04, 3); bell(112.2, 'E7', 0.03, 3); // nihol
  drip(88.75, 0.1, 1300); // ko‘z yoshi yerga tushadi
  [86.2, 86.9, 87.6, 88.3].forEach((t, i) => thump(t, 0.12 - i * 0.02, 48)); // yurak urishi
  for (let t = 66.6; t < 68.2; t += 0.16) step(t, 0.18, true); // kiyik chopib ketadi
  // o‘tishlardagi yengil "shuvillash"
  [27, 30.5, 33.5, 47, 61.5, 68, 78, 99.5, 103, 109].forEach(t => { const s = src(PINK, t - 0.8, t + 0.9); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6; bp.frequency.setValueAtTime(300, t - 0.8); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.2); const g = ctx.createGain(); g.gain.setValueAtTime(0, t - 0.8); g.gain.linearRampToValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0, t + 0.9); s.connect(bp); bp.connect(g); g.connect(sfx); });

  // ================= MUSIQA =================
  // 1 · Yolg‘izlik — bo‘m-bo‘sh, yolg‘iz nay
  drone(0, 11.5, 'D2', 0.09); drone(0.5, 11, 'A2', 0.05);
  pad(0.4, 11, ['D3', 'F3', 'A3'], 0.06, 700, 3, 3);
  mel(2.0, [['A4', 1.3], ['C5', 0.8], ['A4', 0.8], ['G4', 1.5], ['F4', 0.7], ['E4', 0.7], ['D4', 2.2]], (t, n, d) => flute(t, d * 0.98, n, 0.075, -0.2, 1));
  piano(10.45, 'F5', 0.35, 3); piano(10.6, 'A5', 0.3, 3);
  // 2 · So‘nggi suv
  seq(11.1, 0.19, ['D4', 'F4', 'A4', 'D5', 'F4', 'A4', 'D5', 'F5', 'A4', 'D5', 'F5', 'A5', 'C5', 'F5', 'A5', 'C6'], (t, n) => pluck(t, n, 0.05, 0.6, 0.15));
  pad(11, 3.5, ['D3', 'A3', 'F4'], 0.07, 1400, 0.8, 1.2);
  pad(14.2, 2.6, ['Bb2', 'F3', 'D4'], 0.07, 900, 0.8, 1.5);
  piano(16.6, 'E5', 0.4, 2.5); piano(17.6, 'D5', 0.35, 2.5); piano(18.6, 'C5', 0.35, 2.5); piano(19.6, 'Bb4', 0.3, 2.5);
  pad(16.5, 4.2, ['G2', 'D3', 'Bb3'], 0.07, 800, 1.2, 1.5);
  seq(20.7, 0.5, ['F4', 'A4', 'C5', 'A4', 'F5'], (t, n) => piano(t, n, 0.32, 2.5));
  pad(20.6, 3.2, ['F3', 'A3', 'C4'], 0.08, 1300, 1.0, 1.5);
  // 3 · Mehr — iliq major mavzu
  const chords3 = [['F3', 'A3', 'C4'], ['C3', 'G3', 'E4'], ['D3', 'A3', 'F4'], ['Bb2', 'F3', 'D4'], ['F3', 'C4', 'A4'], ['C3', 'G3', 'E4'], ['Bb2', 'D4', 'F4'], ['C3', 'E4', 'G4']];
  chords3.forEach((c, i) => pad(23 + i * 1.75, 2.1, c, 0.08, 1600, 0.6, 1.0));
  chords3.forEach((c, i) => piano(23 + i * 1.75, c[0].replace(/\d/, m => +m - 1), 0.35, 2.4));
  mel(23.3, [['A4', 0.5], ['C5', 0.5], ['F5', 1.0], ['E5', 0.5], ['D5', 0.5], ['C5', 1.0], ['D5', 0.6], ['F5', 0.6], ['A5', 1.3], ['G5', 0.9], ['F5', 0.5], ['E5', 0.5], ['F5', 1.6]], (t, n, d) => piano(t, n, 0.42, 2.2, 0.1));
  mel(31.0, [['C5', 0.4], ['D5', 0.4], ['F5', 0.4], ['G5', 0.4], ['A5', 0.8], ['G5', 0.4], ['F5', 0.8]], (t, n, d) => pluck(t, n, 0.04, 0.5, -0.2));
  mel(33.6, [['F5', 1.2], ['E5', 0.6], ['D5', 0.6], ['C5', 1.2], ['A4', 1.4]], (t, n, d) => flute(t, d, n, 0.065, 0.2, 1));
  strings(33.5, 4.2, ['F3', 'C4', 'A4', 'E5'], 0.06, 1.5, 1800);
  // 4 · Mo‘jiza — qo‘ng‘iroqchalar va sehrli pad
  const ch4 = [['Bb2', 'F3', 'A3', 'D4'], ['A2', 'F3', 'C4', 'E4'], ['G2', 'D3', 'F3', 'A4'], ['C3', 'G3', 'Bb3', 'E4'], ['F2', 'C3', 'A3', 'G4']];
  ch4.forEach((c, i) => pad(37 + i * 2.0, 2.6, c, 0.07, 1800, 0.9, 1.2));
  for (let i = 0; i < 40; i++) { const c = ch4[Math.min(4, Math.floor(i / 8))]; const n = c[(i % 4)]; bell(37.2 + i * 0.24, nf(n) * 4, 0.025, 1.6, Math.sin(i) * 0.5); }
  pad(37, 10, ['F5', 'A5', 'C6'], 0.025, 5000, 3, 3, 'sine');
  mel(45.7, [['C5', 0.15], ['F5', 0.15], ['A5', 0.15], ['C6', 0.15], ['F6', 1.2]], (t, n, d) => bell(t, n, 0.05, 2));
  // 5 · Vasvasa — dutor terimi, Hijoz rangi
  pad(47, 3.5, ['F3', 'A3', 'C4', 'E4'], 0.06, 1500, 1, 1.5);
  mel(47.5, [['C5', 0.6], ['D5', 0.6], ['F5', 1.2], ['E5', 1.0]], (t, n, d) => flute(t, d, n, 0.05, 0.1));
  const hij = ['D4', 'Eb4', 'F#4', 'G4', 'A4', 'G4', 'F#4', 'Eb4'];
  for (let i = 0; i < 34; i++) pluck(49.6 + i * 0.2, hij[i % 8], i % 4 === 0 ? 0.07 : 0.045, 0.45, 0.25, 2200);
  for (let i = 0; i < 9; i++) pluck(49.6 + i * 0.8, 'D3', 0.06, 0.8, -0.2, 900);
  pad(49.6, 7, ['D3', 'F#3', 'A3'], 0.05, 900, 1.5, 1.5);
  mel(51.2, [['A4', 0.5], ['Bb4', 0.5], ['A4', 0.4], ['G4', 0.4], ['F#4', 0.9], ['G4', 0.4], ['A4', 0.4], ['D5', 1.3], ['C5', 0.4], ['Bb4', 0.4], ['A4', 1.2]], (t, n, d) => flute(t, d, n, 0.07, -0.25, 0.5));
  seq(56.2, 0.3, ['D3', null, 'Eb3', null, 'D3', 'Eb3'], (t, n) => pluck(t, n, 0.08, 0.3, 0, 700));
  pad(57.05, 1.5, ['D4', 'Eb4', 'A4'], 0.06, 2500, 0.05, 1.2);
  // 6 · Xato — notinch puls
  for (let t = 58.2; t < 65; t += 0.75) thump(t, 0.12, 52);
  pad(58, 3.6, ['G2', 'D3', 'Bb3'], 0.06, 900, 1, 1.2); pad(61.5, 3.8, ['Eb2', 'Bb2', 'G3'], 0.07, 1100, 1, 1.2);
  mel(59.0, [['D5', 0.8], ['C5', 0.8], ['Bb4', 1.4]], (t, n, d) => flute(t, d, n, 0.05, 0.3, 1));
  mel(62.0, [['G4', 0.7], ['A4', 0.7], ['Bb4', 0.7], ['D5', 1.4]], (t, n, d) => piano(t, n, 0.3, 2.2));
  strings(64.6, 1.6, ['C3', 'Eb3', 'Gb3', 'A3', 'C4'], 0.08, 1.2, 2800);
  // 7 · Haqiqat — bo‘shliq, noto‘g‘ri sozlangan musiqa qutisi
  drone(68.2, 9.5, 'C2', 0.06);
  mel(69.0, [['F5', 1.1], ['G5', 1.1], ['Ab5', 1.6], ['Db5', 1.6], ['C5', 2.2]], (t, n, d) => bell(t, nf(n) * 1.012, 0.035, 2.5, 0.2));
  pad(75.6, 2.4, ['F3', 'A3', 'C4', 'E4'], 0.06, 1400, 0.8, 1); piano(75.8, 'A5', 0.2, 2.5); piano(76.3, 'C6', 0.18, 2.5); piano(76.8, 'F5', 0.2, 2.5);
  strings(77.2, 1.6, ['D3', 'A3', 'D4', 'F4'], 0.07, 0.6, 2400);
  // 8 · Kechikkan pushaymon
  for (let t = 78; t < 81; t += 0.125) pluck(t, (Math.floor(t * 8) % 2) ? 'D4' : 'A3', 0.03, 0.15, 0, 1800);
  pad(78, 3.2, ['D3', 'A3', 'F4'], 0.08, 1600, 0.5, 1); for (let t = 78; t < 81; t += 0.5) thump(t, 0.12, 60);
  pad(81, 3.6, ['D3', 'A3'], 0.04, 600, 1.5, 2);
  mel(84.2, [['D5', 1.4], ['C5', 0.7], ['A4', 0.7], ['F4', 1.4], ['G4', 0.7], ['A4', 2.4]], (t, n, d) => piano(t, n, 0.4, 3, -0.1));
  strings(84, 5.5, ['D3', 'F3', 'A3', 'D4'], 0.07, 2, 1500);
  mel(84.2, [['D3', 2.1], ['C3', 1.4], ['Bb2', 1.4], ['A2', 2.0]], (t, n, d) => pad(t, d + 0.2, [n], 0.06, 700, 0.4, 0.6));
  // 9 · Oxirgi umid
  seq(89.4, 0.75, ['A4', null, 'D5', null, 'E5', 'F5'], (t, n) => piano(t, n, 0.25, 3));
  pad(89, 3.4, ['D3', 'E3', 'A3'], 0.05, 900, 1.5, 1.5);
  pad(92.2, 2.5, ['Bb2', 'F3', 'C4', 'D4'], 0.06, 1300, 0.4, 1.4);
  pad(94.6, 2.8, ['F3', 'A3', 'C4', 'G4'], 0.07, 1800, 0.6, 1.2);
  mel(94.8, [['C5', 0.6], ['F5', 0.6], ['G5', 0.6], ['A5', 1.4]], (t, n, d) => piano(t, n, 0.32, 3, 0.1));
  // 10 · Yangi hayot
  for (let i = 0; i < 12; i++) pluck(97 + i * 0.2, ['F4', 'C5', 'A4', 'C5'][i % 4], 0.035, 0.4, 0.1);
  pad(97, 2.6, ['F3', 'C4', 'A4'], 0.06, 1500, 0.6, 1);
  mel(99.6, [['A4', 0.5], ['C5', 0.5], ['F5', 1.0], ['E5', 0.5], ['D5', 0.5], ['C5', 1.5]], (t, n, d) => flute(t, d, n, 0.07, -0.1, 1));
  pad(99.5, 3.6, ['F3', 'C4', 'A4'], 0.06, 1800, 0.6, 1);
  mel(103.2, [['C6', 0.6], ['A5', 0.6], ['F5', 0.6], ['G5', 0.6], ['A5', 1.2]], (t, n, d) => bell(t, n, 0.035, 2.4));
  pad(103, 3.6, ['F3', 'A3', 'C4'], 0.05, 900, 1.2, 1.2);
  strings(106.4, 2.8, ['D2', 'A2', 'D3', 'F3'], 0.08, 0.8, 1200);
  for (let t = 106.5; t < 109; t += 0.12) pluck(t, 'D3', 0.025, 0.12, 0, 900);
  // 11 · Yakun — to‘liq mavzu, major
  const ch11 = [['F2', 'C3', 'A3', 'F4'], ['Bb2', 'F3', 'D4', 'A4'], ['D3', 'A3', 'F4', 'C5'], ['C3', 'G3', 'E4', 'G4'], ['F2', 'C3', 'A3', 'F4'], ['Bb2', 'D3', 'F4', 'A4'], ['C3', 'G3', 'E4', 'Bb4'], ['F2', 'C3', 'A3', 'G4']];
  ch11.forEach((c, i) => strings(109 + i * 1.9, i === 7 ? 6.5 : 2.4, c, 0.07, i ? 0.6 : 1.8, 2000));
  ch11.forEach((c, i) => piano(109 + i * 1.9, c[0].replace(/\d/, m => +m + 1), 0.3, 2.8));
  mel(110.2, [['A4', 0.6], ['C5', 0.6], ['F5', 1.2], ['E5', 0.6], ['D5', 0.6], ['C5', 1.2], ['D5', 0.7], ['F5', 0.7], ['A5', 1.6], ['G5', 1.0], ['F5', 0.6], ['E5', 0.6], ['F5', 3.2]], (t, n, d) => piano(t, n, 0.42, 3, 0.1));
  mel(117.2, [['C6', 1.2], ['A5', 1.2], ['G5', 1.0], ['F5', 3.0]], (t, n, d) => flute(t, d, n, 0.06, -0.2, 1));
  bell(121.3, 'F6', 0.04, 3); bell(121.6, 'C7', 0.03, 3);
  // yakuniy so‘nish
  master.gain.setValueAtTime(2.3, dur - 3.5); master.gain.linearRampToValueAtTime(0.0, dur);
}
async function renderSoundtrack(dur, sr = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(dur * sr), sr);
  buildSoundtrack(ctx, dur);
  return await ctx.startRendering();
}
function audioBufferToWav(buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(data[c][i], -1, 1); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true); o += 2; }
  return new Uint8Array(out.buffer);
}

// =====================================================================
//  09 · Film yig‘uvchi: har bir kadrni t vaqtning sof funksiyasi sifatida
//       chizish, sahnalararo silliq o‘tish (dissolve), matn, pleer
// =====================================================================
const QS = new URLSearchParams(location.search);
const FW = +QS.get('w') || 1920, FH = +QS.get('h') || 1080, QSHELLS = QS.get('shells') == null ? null : +QS.get('shells');
let R = null, G = {}, fox, deer, flower, sprout, textCanvas, textKey = '';
const PART = {};
function buildAll(canvas) {
  R = new Renderer(canvas, FW, FH);
  G.terrain = R.mesh(buildTerrain());
  G.tree = R.mesh(buildTree());
  G.rocks = R.mesh(buildRocks());
  G.shrubs = R.mesh(buildShrubs());
  G.pool = R.mesh(discGeo(1, 48, 6, [1, 1, 1], 0.1, 3));
  G.pond = R.mesh(discGeo(3.1, 64, 8, [1, 1, 1], 0.12, 7));
  const md = buildMeadow();
  G.grass = R.mesh(md.grass); G.mtrees = R.mesh(md.trees); G.fakes = R.mesh(md.fakes); G.junk = R.mesh(md.junk);
  G.fakeOne = R.mesh(fakeFlowerGeo(srgb('#FF2D55')));
  G.leaf = R.mesh(leafCupGeo()); G.leafWater = R.mesh(discGeo(1, 20, 3, [1, 1, 1], 0.05, 2));
  G.stick = R.mesh(stickGeo(0.3, 0.0065, 5)); G.stick2 = R.mesh(stickGeo(0.3, 0.0075, 9)); G.frond = R.mesh(frondGeo());
  G.seed = R.mesh(seedGeo());
  fox = new Creature(R, FOX_CFG); deer = new Creature(R, DEER_CFG);
  flower = new Flower(R, FLOWER_POS); sprout = new Sprout(R, SEED_SPOT);
  for (const k of ['sand', 'motes', 'drops', 'magic', 'glow', 'dust']) PART[k] = new PartBatch(k === 'sand' ? 9000 : 3000, k === 'magic' || k === 'glow');
  textCanvas = document.createElement('canvas'); textCanvas.width = FW; textCanvas.height = FH;
  initStory();
}
const item = (mesh, mat, world) => ({ mesh, mat, world, nm: M4.normalMat(world) });
const MAT = {
  terrain: { mode: 1, cast: false, gloss: 1 }, tree: { cast: true, gloss: 1 }, rocks: { cast: true, gloss: 1 },
  shrubs: { cast: true, gloss: 1, sway: [0.03, 1.8, 0.004, 0] }, pool: { mode: 2, water: [0.03, 0.12, 0.14], cast: false },
  pond: { mode: 2, water: [0.10, 0.09, 0.035], murk: 0.85, cast: false }, leaf: { cast: true, gloss: 1 }, stick: { cast: true, gloss: 1 },
  frond: { cast: true, gloss: 1, sway: [0.01, 2.0, 0.002, 0] }, seed: { cast: true, gloss: 1, emis: 0.0 }, fake: { cast: true, gloss: 1.3 },
};
// ---------- rekvizitlar treklari ----------
const POOL_R = T([[0, 0.38], [20.6, 0.38], [21.0, 0.3], [23, 0.24], [27, 0.15], [37, 0.12], [47, 0.1], [58, 0.09], [81, 0.0]]);
const SPROUT = { g: T([[0, 0], [110.4, 0], [113.2, 1]]), unf: T([[0, 0], [111.4, 0], [113.6, 1]]) };
// pana: quyosh tomonda ikki ustun, ustida ko‘ndalang tayoq va quruq palma bargi
const SUNS = V.norm([Math.sin(205 * DEG), 0, Math.cos(205 * DEG)]), SUNP = [-SUNS[2], 0, SUNS[0]];
const STICKS = (() => {
  const c = FLOWER_POS, at = (s, p) => [c[0] + SUNS[0] * s + SUNP[0] * p, c[1] + SUNS[2] * s + SUNP[2] * p];
  const top = (s, p, h) => { const q = at(s, p); return [q[0], h, q[1]]; };
  return [
    { base: at(0.2, 0.11), apex: top(0.05, 0.09, 0.25), fall: at(0.42, 0.2), show: 30.3 },
    { base: at(0.2, -0.11), apex: top(0.05, -0.09, 0.25), fall: at(0.38, -0.26), show: 30.3 },
    { base: at(0.05, 0.15), apex: top(0.05, -0.15, 0.255), fall: at(0.5, 0.0), show: 31.85, bar: true },
    { base: at(0.24, 0.0), apex: top(0.06, 0.0, 0.24), fall: at(0.25, 0.35), show: 32.6 },
  ];
})();
function propsAt(t, out, W) {
  const terrH = (x, z) => H(x, z);
  // buloq suvi
  const pr = POOL_R.at(t);
  if (pr > 0.01) {
    const y = terrH(POOL[0] + pr, POOL[1]) + 0.003;
    out.push(item(G.pool, MAT.pool, M4.trs([POOL[0], y, POOL[1]], Q.ident(), [pr * 1.08, 1, pr * 1.08])));
  }
  // sun’iy o‘tloq ko‘lmagi
  out.push(item(G.pond, MAT.pond, M4.trs([POND[0], H(POND[0] + 2.9, POND[1]) + 0.02, POND[1]], Q.ident(), [1, 1, 1])));
  // pana (tayoqchalar va tom)
  const collapse = ramp(t, 79, 80.5);
  STICKS.forEach((s, i) => {
    if (t < s.show || W.memory) return;
    const b = s.bar ? [s.base[0], 0.255, s.base[1]] : gp(s.base[0], s.base[1], -0.01);
    const top = collapse > 0 ? V.lerp(s.apex, gp(s.fall[0], s.fall[1], 0.01), collapse) : s.apex;
    if (s.bar && collapse > 0) { b[1] = lerp(0.255, H(s.base[0], s.base[1]) + 0.01, collapse); }
    const bb = collapse > 0 ? V.lerp(b, gp((s.base[0] + s.fall[0]) * 0.5 - (s.fall[0] - s.base[0]) * 0.4, (s.base[1] + s.fall[1]) * 0.5 - (s.fall[1] - s.base[1]) * 0.4, 0.005), collapse * 0.5) : b;
    const pop = smooth((t - s.show) / 0.25);
    out.push(item(i % 2 ? G.stick2 : G.stick, MAT.stick, boneMatrix(bb, V.lerp(V.add(bb, [0, 0.02, 0]), top, pop), [1, 0, 0], 0.3)));
  });
  if (t > 33.0) {
    const pop = smooth((t - 33.0) / 0.3), off = t > 36.6;
    const ap = [FLOWER_POS[0] + SUNS[0] * 0.07, 0.262, FLOWER_POS[1] + SUNS[2] * 0.07];
    const yaw = Math.atan2(-SUNS[0], -SUNS[2]);
    const m = off ? M4.trs(gp(FLOWER_POS[0] + 0.42, FLOWER_POS[1] + 0.05, 0.012), Q.euler(0.04, 2.2, 0.02), [1, 1, 1]) : collapse > 0 ? M4.trs(V.lerp(ap, gp(FLOWER_POS[0] + SUNS[0] * 0.3, FLOWER_POS[1] + SUNS[2] * 0.3, 0.012), collapse), Q.euler(lerp(0.22, 0.05, collapse), yaw + collapse * 0.8, 0), [1, 1, 1])
      : M4.trs(ap, Q.euler(0.22, yaw, 0.03), [pop, pop, pop]);
    out.push(item(G.frond, MAT.frond, m));
  }
  // sahroda yoyilgan barg-kosa / og‘izda
  const leafCarry = (t > 27 && t < 30.3) || (t > 99.5 && t < 103);
  if (leafCarry && W.foxJawM) {
    const pour = t < 31 ? pulse(t, 29.3, 29.6, 30.1, 30.3) : pulse(t, 101.8, 102.1, 102.8, 103);
    const m = M4.mul(W.foxJawM, M4.trs([0, -0.004, 0.075], Q.mul(Q.axis([1, 0, 0], -0.35 + pour * 0.5), Q.axis([0, 0, 1], pour * 0.25)), [1, 1, 1]));
    out.push(item(G.leaf, MAT.leaf, m));
    const fill = t < 31 ? 1 - ramp(t, 29.5, 30.25) : 1 - ramp(t, 101.95, 102.85);
    if (fill > 0.05) out.push(item(G.leafWater, MAT.pool, M4.mul(m, M4.trs([0, 0.012, 0.0], Q.axis([1, 0, 0], -pour * 0.6), [0.03 * fill + 0.01, 1, 0.05 * fill + 0.015]))));
    W.leafTip = M4.xform(m, [0, 0.01, 0.075]);
  } else if (t > 30.3) {
    out.push(item(G.leaf, MAT.leaf, M4.trs(gp(0.42, 0.78, 0.008), Q.euler(0.05, 1.2, 0.1), [1, 1, 1])));
  }
  // og‘izdagi tayoqcha (pana qurilishi)
  if (t > 31.0 && t < 31.85 && W.foxJawM) out.push(item(G.stick, MAT.stick, M4.mul(W.foxJawM, M4.trs([-0.15, 0, 0.06], Q.axis([0, 0, 1], -Math.PI / 2), [1, 1, 1]))));
  // urug‘lar
  const seedM = (p, s = 1) => item(G.seed, Object.assign({}, MAT.seed, { emis: W.seedGlow || 0 }), M4.trs(p, Q.euler(0.4, 0.8, 0.2), [s, s, s]));
  if (t > 57.25 && t < 60) { // gul boshidan yerga tushgan bitta urug‘
    const u = clamp((t - 57.25) / 0.45, 0, 1);
    const p0 = W.flowerHeadAt57 || gp(FLOWER_POS[0], FLOWER_POS[1], 0.17), p1 = gp(SEED_FOUND[0], SEED_FOUND[1], 0.003);
    out.push(seedM([lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u * u), lerp(p0[2], p1[2], u)]));
  }
  if (t > 91.6 && t < 95.4) out.push(seedM(gp(SEED_FOUND[0], SEED_FOUND[1], lerp(-0.004, 0.003, ramp(t, 91.6, 92.4)))));
  if (t >= 95.4 && t < 97.8 && W.foxPawsMid) { const p = V.lerp(gp(SEED_FOUND[0], SEED_FOUND[1], 0.003), V.add(W.foxPawsMid, [0, 0.012, 0.004]), smooth((t - 95.4) / 0.35)); out.push(seedM(p, 1.6)); W.seedPos = p; }
  if (t >= 97.8 && t < 99.0) { const p = V.lerp(W.foxPawsMid ? V.add(W.foxPawsMid, [0, 0.01, 0]) : gp(SEED_SPOT[0], SEED_SPOT[1], 0.02), gp(SEED_SPOT[0], SEED_SPOT[1], lerp(0.002, -0.006, ramp(t, 98.3, 99))), smooth((t - 97.8) / 0.4)); out.push(seedM(p)); }
  // yiqiladigan sun’iy gul
  if (t > 60) {
    const f = ramp(t, 72.2, 72.6);
    out.push(item(G.fakeOne, MAT.fake, M4.trs(gp(FAKE_ONE[0], FAKE_ONE[1], 0), Q.euler(f * 1.45, 0.4, 0), [1.4, 1.4, 1.4])));
  }
}
function wetSpots(t) {
  const w = new Float32Array(16);
  const set = (i, xz, r, a) => { w[i * 4] = xz[0]; w[i * 4 + 1] = xz[1]; w[i * 4 + 2] = r; w[i * 4 + 3] = a; };
  set(0, POOL, 0.62 + POOL_R.at(t) * 0.3, lerp(0.15, 0.6, clamp(POOL_R.at(t) / 0.3, 0, 1)));
  set(1, FLOWER_POS, lerp(0.05, 1.9, ramp(t, 41.6, 46)), 0.75 * ramp(t, 41.6, 44) * (1 - ramp(t, 47, 60) * 0.85) * (t < 78 ? 1 : 0));
  set(2, FLOWER_POS, 0.2 + 0.08 * ramp(t, 22, 23), Math.max(0.75 * pulse(t, 22, 22.6, 26, 30), 0.8 * pulse(t, 29.6, 30, 33, 36)));
  set(3, SEED_SPOT, 0.22, 0.8 * ramp(t, 102.1, 102.7) * (1 - ramp(t, 103.5, 110) * 0.55));
  return w;
}
// ---------- zarrachalar ----------
function particlesAt(t, env, W, camTgt) {
  const list = [];
  const sand = PART.sand.reset(), motes = PART.motes.reset(), drops = PART.drops.reset(), magic = PART.magic.reset(), glow = PART.glow.reset();
  let sAmt = env.sand;
  if (t > 33.6 && t < 35.6) sAmt += 1.2 * pulse(t, 33.6, 34, 35, 35.6);
  emitSand(sand, t, camTgt, Math.min(sAmt, 1.6), env.wind, t > 106.4 && t < 109.2);
  list.push(sand);
  const moteCol = V.mul(env.sunCol, 0.25);
  emitMotes(motes, t, V.add(camTgt, [0, -0.3, 0]), t < 37 || (t > 47 && t < 68) ? 0.6 : 0.25, moteCol);
  list.push(motes);
  const water = [0.75, 0.85, 1.0];
  // og‘izdan gulga quyilgan suv (2-sahna)
  if (t > 21.8 && t < 23.4 && W.foxMouth) {
    for (let i = 0; i < 40; i++) { const t0 = 21.85 + i * 0.024; emitDrop(drops, t, t0, V.add(W.foxMouth, [(hash1(i) - 0.5) * 0.008, -0.005, (hash1(i + 9) - 0.5) * 0.008]), [(hash1(i + 3) - 0.5) * 0.05, -0.1, (hash1(i + 5) - 0.5) * 0.05], water, 0.0045, 0.6); }
  }
  // barg-kosadan quyish
  const pourSeg = (a, b) => { if (t > a && t < b + 0.6 && W.leafTip) for (let i = 0; i < 70; i++) { const t0 = a + i * (b - a) / 70; emitDrop(drops, t, t0, V.add(W.leafTip, [(hash1(i * 2) - 0.5) * 0.006, 0, (hash1(i * 3) - 0.5) * 0.006]), [(hash1(i + 1) - 0.5) * 0.06, -0.05, (hash1(i + 7) - 0.5) * 0.06], water, 0.004, 0.5); } };
  pourSeg(29.55, 30.25); pourSeg(102.0, 102.85);
  // yalash payti tomchilar
  if (t > 15.2 && t < 16.6 && W.foxMouth) for (let i = 0; i < 12; i++) emitDrop(drops, t, 15.25 + i * 0.1, W.foxMouth, [(hash1(i) - 0.5) * 0.2, 0.2 + hash1(i + 2) * 0.2, (hash1(i + 4) - 0.5) * 0.2], water, 0.003, 0.5);
  // sehrli yomg‘ir (4-sahna)
  if (t > 37.5 && t < 47.5 && W.flowerHead) {
    const fh = W.flowerHead, k = ramp(t, 38, 40) * (1 - ramp(t, 46.2, 47.4));
    const gold = [1.0, 0.85, 0.6], blue = [0.55, 0.8, 1.0];
    // barg uchlarida yig‘ilayotgan tomchilar
    for (let i = 0; i < 7; i++) {
      const az = i * TAU / 7 + 0.2, life = 1.6, ph = ((t - 38) / life + i * 0.37) % 1;
      if (t < 38) continue;
      const tip = V.add(fh, [Math.sin(az) * 0.045, 0.012 - ph * ph * 0.04, Math.cos(az) * 0.045]);
      magic.push(tip, blue, 0.95 * k, 0.006 + 0.004 * Math.sin(ph * Math.PI), 2);
    }
    // ko‘tariluvchi uchqunlar spirali
    for (let i = 0; i < 220; i++) {
      const life = 3.2, ph = ((t - 38) / life + hash1(i * 1.7)) % 1; if (t < 38.2) continue;
      const a = hash1(i) * TAU + ph * 4, r = 0.02 + ph * 0.25 * hash1(i + 3);
      const p = V.add(fh, [Math.cos(a) * r, ph * 0.9 * (0.5 + hash1(i + 9)), Math.sin(a) * r]);
      glow.push(p, V.lerp(gold, blue, hash1(i + 5)), Math.sin(ph * Math.PI) * 0.9 * k, 0.009 + hash1(i + 11) * 0.008, 1);
    }
    // atrofga yog‘ayotgan mayin yomg‘ir
    const rk = ramp(t, 41.4, 42.4) * (1 - ramp(t, 46.0, 47.2));
    for (let i = 0; i < 700 * rk; i++) {
      const life = 0.9 + hash1(i * 3.1) * 0.4, ph = ((t - 41) / life + hash1(i * 1.3)) % 1;
      const a = hash1(i * 7.7) * TAU, r = Math.sqrt(hash1(i * 5.3)) * 1.7;
      const x = fh[0] + Math.cos(a) * r, z = fh[2] + Math.sin(a) * r, gy = H(x, z);
      const y = lerp(gy + 1.4, gy, ph);
      magic.push([x, y, z], blue, 0.65 * rk * (ph < 0.95 ? 1 : 0), 0.0065, 2);
      if (ph > 0.93) glow.push([x, gy + 0.005, z], blue, 0.5 * rk, 0.012, 1);
    }
    // burunga tushadigan tomchi
    if (t > 43.9 && t < 44.65 && W.foxNose) { const u = (t - 43.9) / 0.72; magic.push(V.add(W.foxNose, [0, (1 - u) * 0.5 + 0.008, 0]), blue, 1, 0.006, 2); }
    if (t > 44.6 && t < 45.2 && W.foxNose) for (let i = 0; i < 10; i++) { const u = (t - 44.6) / 0.6; const a = i * TAU / 10; glow.push(V.add(W.foxNose, [Math.cos(a) * u * 0.04, 0.01 + Math.sin(u * 3) * 0.01, Math.sin(a) * u * 0.04]), blue, (1 - u) * 0.8, 0.006, 1); }
  }
  // kovlash — qum sachrashi
  const digAmt = Math.max(FX.dig.at(t), 0);
  if (digAmt > 0.2 && W.foxPawsMid) for (let i = 0; i < 90; i++) {
    const life = 0.5, ph = ((t * 1.0) / life + hash1(i * 2.3)) % 1, k = Math.floor(t / life + hash1(i * 2.3));
    const p0 = V.add(W.foxPawsMid, [0, -0.005, 0]), back = V.mul(W.foxFwd, -1);
    const vx = back[0] * (0.4 + hash1(i + k) * 0.5) + (hash1(i * 3 + k) - 0.5) * 0.4, vz = back[2] * (0.4 + hash1(i + k) * 0.5) + (hash1(i * 5 + k) - 0.5) * 0.4, vy = 0.5 + hash1(i * 7 + k) * 0.6;
    const dt = ph * life, p = [p0[0] + vx * dt, p0[1] + vy * dt - 4.9 * dt * dt, p0[2] + vz * dt];
    if (p[1] > H(p[0], p[2])) sand.push(p, SAND_COL, 0.8 * digAmt, 0.006, 0);
  }
  // urug‘ va nihol nuri
  if (t > 92 && t < 99 && W.seedPosGlow) for (let i = 0; i < 26; i++) { const ph = (t * 0.4 + hash1(i)) % 1, a = hash1(i + 2) * TAU; glow.push(V.add(W.seedPosGlow, [Math.cos(a + t) * 0.012, ph * 0.05, Math.sin(a + t) * 0.012]), [1, 0.85, 0.5], Math.sin(ph * Math.PI) * 0.6, 0.004, 1); }
  if (t > 110.6 && t < 116 && W.sproutTop) for (let i = 0; i < 30; i++) { const ph = (t * 0.35 + hash1(i)) % 1, a = hash1(i + 2) * TAU; glow.push(V.add(W.sproutTop, [Math.cos(a + t * 0.5) * 0.03 * ph, ph * 0.08 - 0.02, Math.sin(a + t * 0.5) * 0.03 * ph]), [1, 0.92, 0.6], Math.sin(ph * Math.PI) * 0.5 * pulse(t, 110.6, 111.5, 114.5, 116), 0.004, 1); }
  // ko‘z yoshining yerga tushishi
  if (t > 88.45 && t < 89.0 && W.foxChin) emitDrop(drops, t, 88.45, W.foxChin, [0, -0.05, 0], [0.8, 0.9, 1], 0.005, 0.6);
  if (t > 115.0 && t < 115.6 && W.foxChin) emitDrop(drops, t, 115.0, W.foxChin, [0, -0.05, 0], [1, 0.95, 0.85], 0.004, 0.6);
  // pashshalar
  if (t > 68.3 && t < 77.8) for (let i = 0; i < 14; i++) { const c = gp(POND[0] - 1.8 + hash1(i) * 1.2, POND[1] + hash1(i + 1) * 1.4 - 0.6, 0.25); drops.push(V.add(c, [Math.sin(t * (5 + i) + i) * 0.25, Math.sin(t * (7 + i * 0.5)) * 0.1, Math.cos(t * (6 + i) + i * 2) * 0.25]), [0.05, 0.05, 0.05], 0.9, 0.006, 0); }
  list.push(drops, magic, glow);
  return list;
}
// ---------- dunyoni t vaqtda yig‘ish ----------
function cameraFor(shot, t, W) {
  const c = shot.cam(t, W);
  if (shot.shake) { const a = shot.shake; c.pos = V.add(c.pos, [shake(t, 1, 0.7) * a, shake(t, 2, 0.6) * a, shake(t, 3, 0.8) * a]); c.tgt = V.add(c.tgt, [shake(t, 4, 0.5) * a * 0.6, shake(t, 5, 0.55) * a * 0.6, 0]); }
  const gy = H(c.pos[0], c.pos[2]) + 0.03; if (c.pos[1] < gy) c.pos[1] = gy;
  return c;
}
function worldAt(t, opts = {}) {
  const env = envAt(t), W = { memory: !!opts.memory };
  // gul
  const fs = flowerState(t, W);
  if (opts.memory) Object.assign(fs, { health: 1, open: 1, glow: 0.9, droop: 0, wilt: 0, fallen: 0, seeds: 1, bow: 0 });
  flower.update(t, fs, env.wind);
  W.flowerHead = flower.headPos;
  if (t > 57.2) { const save = flower.headPos; W.flowerHeadAt57 = V.add(gp(FLOWER_POS[0], FLOWER_POS[1], 0), [0, 0.16, 0]); }
  // taxminiy boshlar (nigoh uchun)
  const fm = sampleTable(FOX_TAB, t), dm = sampleTable(DEER_TAB, t);
  W.foxHead = gp(fm.pos[0] + Math.sin(fm.heading) * 0.17, fm.pos[1] + Math.cos(fm.heading) * 0.17, 0.27);
  W.deerHead = gp(dm.pos[0] + Math.sin(dm.heading) * 0.32, dm.pos[1] + Math.cos(dm.heading) * 0.32, 0.66);
  W.camPos = opts.camPosGuess || V.add(W.foxHead, [0, 0, 0.5]);
  const seedSpot = gp(SEED_SPOT[0], SEED_SPOT[1], 0.01);
  W.sproutTop = gp(SEED_SPOT[0], SEED_SPOT[1], 0.004 + 0.06 * SPROUT.g.at(t));
  // tulki
  const fst = foxState(t, W);
  fox.update(t, fst, null, env.wind);
  W.foxHead = fox.headPos; W.foxRoot = fox.anchor.root; W.foxFwd = fox.anchor.fwd; W.foxRgt = fox.anchor.rgt;
  W.foxMouth = fox.anchor.mouth; W.foxNose = fox.anchor.nose; W.foxJawM = fox.anchor.jawM; W.foxPawsMid = fox.anchor.pawsMid;
  W.foxEye = fox.anchor.eyes[0].center; W.foxChin = M4.xform(fox.headM, [0.0, -0.055, 0.06]);
  // kiyik
  W.deerVis = DX.vis.at(t) > 0.5;
  if (W.deerVis) { const dst = deerState(t, W); deer.update(t, dst, null, env.wind); W.deerHead = deer.headPos; W.deerRoot = deer.anchor.root; }
  else W.deerRoot = gp(dm.pos[0], dm.pos[1]);
  W.seedGlow = t > 91.8 && t < 99 ? 0.6 + 0.4 * Math.sin(t * 3) : 0;
  W.seedPosGlow = t < 95.4 ? gp(SEED_FOUND[0], SEED_FOUND[1], 0.004) : (W.seedPos || seedSpot);
  return { env, W, fs };
}
function assembleItems(t, w, camPos) {
  const { env, W } = w, items = [];
  items.push(item(G.terrain, MAT.terrain, M4.ident()));
  items.push(item(G.tree, MAT.tree, M4.ident()), item(G.rocks, MAT.rocks, M4.ident()), item(G.shrubs, MAT.shrubs, M4.ident()));
  // o‘tloq: uzoqdan yam-yashil, yaqindan kulrang va jonsiz
  const truth = ramp(t, 68.6, 71.5);
  const lushT = [1.15, 1.2, 1.0], deadT = [0.55, 0.52, 0.38];
  const gt = V.lerp(lushT, deadT, truth);
  const mg = { cast: false, gloss: 1, tint: gt, mix: [0.2, 0.19, 0.13, truth * 0.55], sway: [truth > 0.5 ? 0.0 : 0.06, 1.5, 0.003, 0], emis: (1 - truth) * 0.15 };
  items.push(item(G.grass, mg, M4.ident()), item(G.mtrees, Object.assign({}, mg, { cast: true, sway: [0, 1, 0, 0] }), M4.ident()));
  items.push(item(G.fakes, MAT.fake, M4.ident()), item(G.junk, { cast: true, gloss: 1, tint: [0.8, 0.8, 0.8] }, M4.ident()));
  items.push(...flower.items);
  const g = SPROUT.g.at(t); if (g > 0) items.push(...sprout.update(t, g, SPROUT.unf.at(t)));
  items.push(...fox.items, ...fox.catchlights(camPos));
  if (W.deerVis) items.push(...deer.items, ...deer.catchlights(camPos));
  propsAt(t, items, W);
  return items;
}
function envForRender(e, t, cam, W) {
  const wl = Math.hypot(e.wind[0], e.wind[2]) || 1;
  return Object.assign({}, e, {
    time: t, wet: wetSpots(t), meadow: [MEADOW[0], MEADOW[1], 22, ramp(t, 68.6, 71.5)],
    rippleDir: [e.wind[0] / wl, e.wind[2] / wl, 0], shadowCenter: cam.tgt, shadowRadius: clamp(V.dist(cam.pos, cam.tgt) * 0.75, 0.5, 9),
  });
}
function renderPass(t, shot, opts = {}) {
  // 1-chi o‘tish: dunyo + kamera
  let w = worldAt(t, opts);
  let cam = opts.memory ? camLook(V.add(w.W.flowerHead, [0.22, 0.05, 0.26]), w.W.flowerHead, 30, null, 2.0) : cameraFor(shot, t, w.W);
  // kameraga qarash kerak bo‘lsa — qayta hisoblash
  if ((t > 44.6 && t < 47) || (t > 113.4 && t < 116)) { w = worldAt(t, Object.assign({}, opts, { camPosGuess: cam.pos })); cam = cameraFor(shot, t, w.W); }
  const envR = envForRender(opts.memory ? envAt(25.5) : w.env, t, cam, w.W);
  if (opts.memory) envR.wet = new Float32Array(16);
  const items = assembleItems(t, w, cam.pos);
  const parts = opts.memory ? [] : particlesAt(t, envR, w.W, cam.tgt);
  const view = M4.lookAt(cam.pos, cam.tgt, [0, 1, 0]);
  const proj = M4.persp(cam.fov, FW / FH, 0.02, 1500);
  R.renderScene({ cam: { pos: cam.pos, view, proj, fov: cam.fov }, env: envR, items, parts, shells: QSHELLS == null ? opts.shells : QSHELLS });
  const e = envR;
  return {
    exposure: e.exposure, sat: e.sat, contrast: e.contrast, bloom: e.bloom, bloomThr: e.bloomThr, vig: e.vig, grain: e.grain, time: t,
    focus: cam.focus, aperture: cam.ap * 0.6, haze: e.haze, tint: e.tint, lift: e.lift, cam,
  };
}
function drawText(t) {
  const title = pulse(t, 0.8, 2.4, 4.0, 5.2), quote = ramp(t, 117.4, 119.6);
  const key = title > 0 ? 'title' : quote > 0 ? 'quote' : '';
  if (key !== textKey) {
    textKey = key;
    const c = textCanvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, FW, FH); c.setTransform(FW / 1920, 0, 0, FW / 1920, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (key === 'title') {
      c.shadowColor = 'rgba(60,30,10,0.55)'; c.shadowBlur = 18;
      c.fillStyle = '#FFF4E4'; c.font = '600 92px "Cormorant Garamond", "Playfair Display", Georgia, "DejaVu Serif", serif';
      if ('letterSpacing' in c) c.letterSpacing = '10px';
      c.fillText('SO‘NGGI YOMG‘IR TOMCHISI', 1920 / 2, 1080 * 0.40);
      if ('letterSpacing' in c) c.letterSpacing = '6px';
      c.font = 'italic 34px "Cormorant Garamond", Georgia, "DejaVu Serif", serif'; c.fillStyle = 'rgba(255,240,220,0.85)';
      c.fillText('qisqa metrajli animatsion film', 1920 / 2, 1080 * 0.40 + 82);
    } else if (key === 'quote') {
      c.shadowColor = 'rgba(40,20,10,0.6)'; c.shadowBlur = 16; c.fillStyle = '#FFF6EA';
      c.font = 'italic 52px "Cormorant Garamond", Georgia, "DejaVu Serif", serif';
      if ('letterSpacing' in c) c.letterSpacing = '1px';
      c.fillText('«Ba’zan bizga berilgan eng katta ne’matning qadrini', 1920 / 2, 1080 * 0.17);
      c.fillText('uni yo‘qotganimizdan keyin anglaymiz…»', 1920 / 2, 1080 * 0.17 + 72);
    }
    R.setText(textCanvas);
  }
  return key === 'title' ? title : key === 'quote' ? quote : 0;
}
function drawFilm(t, opts = {}) {
  t = clamp(t, 0, DURATION - 1e-3);
  const si = shotAt(t), shot = SHOTS[si];
  const textA = drawText(t);
  let mixPrev = 0;
  if (shot.trans && t < shot.t0 + shot.td && si > 0) {
    const w = smoother((t - shot.t0) / shot.td);
    if (shot.trans === 'dissolve') {
      const prevPost = renderPass(t, SHOTS[si - 1], opts); R.composite(prevPost, true);
      mixPrev = w;
    } else if (shot.trans === 'blend') {
      const ps = SHOTS[si - 1], cs = shot;
      shot._blend = { prev: ps, w };
    }
  }
  if (shot.memory && t > shot.memory.t0 && t < shot.memory.t1) {
    const mp = renderPass(t, shot, Object.assign({}, opts, { memory: true }));
    mp.tint = [1.25, 1.05, 0.85]; mp.exposure *= 1.1; R.composite(mp, true);
    mixPrev = 1 - shot.memory.a * pulse(t, shot.memory.t0, shot.memory.t0 + 0.6, shot.memory.t1 - 0.6, shot.memory.t1);
  }
  const post = renderPass(t, shot._blend && shot._blend.w < 1 ? blendShot(shot, t) : shot, opts);
  shot._blend = null;
  post.textA = textA;
  R.composite(post, false, mixPrev);
}
function blendShot(shot, t) {
  const b = shot._blend, prev = b.prev, w = b.w;
  return { cam: (tt, W) => { const a = prev.cam(tt, W), c = shot.cam(tt, W); return { pos: V.lerp(a.pos, c.pos, w), tgt: V.lerp(a.tgt, c.tgt, w), fov: lerp(a.fov, c.fov, w), focus: lerp(a.focus, c.focus, w), ap: lerp(a.ap, c.ap, w) }; } };
}

// ================= PLEER =================
const Player = {
  t: 0, playing: false, audioCtx: null, buffer: null, srcNode: null, gain: null, startedAt: 0, offset: 0, vol: 0.8, muted: false, ready: false, shells: QS.get('q') === 'low' ? 3 : 7, slow: 0,
};
function fmtTime(s) { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
async function bootPlayer() {
  const canvas = document.getElementById('film');
  const ui = id => document.getElementById(id);
  const setStatus = s => { const el = ui('status'); if (el) el.textContent = s; };
  try {
    setStatus('Sahnalar qurilmoqda…');
    await new Promise(r => setTimeout(r, 30));
    buildAll(canvas);
    drawFilm(0.01);
    window.renderFrame = t => { drawFilm(t); return canvas.toDataURL('image/jpeg', 0.93); };
    window.__READY = true;
    if (window.__HEADLESS) return;
    setStatus('Musiqa va tovushlar yozilmoqda…');
    await new Promise(r => setTimeout(r, 30));
    try { Player.buffer = await renderSoundtrack(DURATION); } catch (e) { console.warn('ovoz yaratilmadi', e); }
    setStatus('');
    Player.ready = true;
    ui('loader').classList.add('hidden');
    ui('bigplay').classList.remove('hidden');
  } catch (e) {
    console.error(e); setStatus('Xatolik: ' + e.message + ' (WebGL2 qo‘llab-quvvatlanadigan brauzer kerak)');
    return;
  }
  // tugmalar
  const play = () => {
    if (!Player.ready) return;
    if (!Player.audioCtx) { Player.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); Player.gain = Player.audioCtx.createGain(); Player.gain.connect(Player.audioCtx.destination); applyVol(); }
    Player.audioCtx.resume();
    if (Player.t >= DURATION - 0.05) Player.t = 0;
    Player.offset = Player.t; Player.startedAt = Player.audioCtx.currentTime;
    if (Player.buffer) { Player.srcNode = Player.audioCtx.createBufferSource(); Player.srcNode.buffer = Player.buffer; Player.srcNode.connect(Player.gain); Player.srcNode.start(0, Player.t); }
    Player.playing = true; ui('bigplay').classList.add('hidden'); syncButtons();
  };
  const pause = () => { if (!Player.playing) return; Player.t = curTime(); stopSrc(); Player.playing = false; syncButtons(); };
  const stopSrc = () => { if (Player.srcNode) { try { Player.srcNode.stop(); } catch (e) { } Player.srcNode.disconnect(); Player.srcNode = null; } };
  const curTime = () => Player.playing ? Player.offset + (Player.audioCtx.currentTime - Player.startedAt) : Player.t;
  const seek = s => { const was = Player.playing; if (was) { stopSrc(); Player.playing = false; } Player.t = clamp(s, 0, DURATION); if (was) play(); else drawFilm(Player.t, { shells: Player.shells }); updateUI(); };
  const applyVol = () => { if (Player.gain) Player.gain.gain.value = Player.muted ? 0 : Player.vol; ui('mute').textContent = Player.muted || Player.vol === 0 ? '🔇' : Player.vol < 0.5 ? '🔉' : '🔊'; };
  const syncButtons = () => { ui('playpause').textContent = Player.playing ? '❚❚' : '▶'; ui('playpause').title = Player.playing ? 'Pauza' : 'Ijro'; };
  const updateUI = () => {
    const t = Player.playing ? curTime() : Player.t;
    ui('seek').value = (t / DURATION * 1000).toFixed(0);
    ui('time').textContent = fmtTime(t) + ' / ' + fmtTime(DURATION);
    let sc = SCENES[0]; for (const s of SCENES) if (t >= s.t) sc = s;
    ui('scene').textContent = sc.n + '-sahna · ' + sc.name;
  };
  ui('bigplay').onclick = play;
  ui('playpause').onclick = () => Player.playing ? pause() : play();
  ui('restart').onclick = () => { seek(0); if (!Player.playing) play(); };
  ui('seek').oninput = e => seek(e.target.value / 1000 * DURATION);
  ui('vol').oninput = e => { Player.vol = e.target.value / 100; Player.muted = false; applyVol(); };
  ui('mute').onclick = () => { Player.muted = !Player.muted; applyVol(); };
  ui('full').onclick = () => { const el = ui('stage'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen && el.requestFullscreen(); };
  const marks = ui('marks'); SCENES.forEach(s => { const m = document.createElement('i'); m.style.left = (s.t / DURATION * 100) + '%'; m.title = s.n + '. ' + s.name; marks.appendChild(m); });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); Player.playing ? pause() : play(); }
    if (e.code === 'ArrowRight') seek(curTime() + 5); if (e.code === 'ArrowLeft') seek(curTime() - 5);
    if (e.code === 'KeyF') ui('full').click(); if (e.code === 'KeyM') ui('mute').click();
  });
  const loop = () => {
    if (Player.playing) {
      Player.t = curTime();
      if (Player.t >= DURATION) { Player.t = DURATION; stopSrc(); Player.playing = false; syncButtons(); }
      const a = performance.now(); drawFilm(Player.t, { shells: Player.shells }); const dt = performance.now() - a;
      // sekin qurilmalarda mo‘yna qatlamlarini avtomatik kamaytirish
      Player.slow = dt > 45 ? Player.slow + 1 : Math.max(0, Player.slow - 1);
      if (Player.slow > 20 && Player.shells > 2) { Player.shells -= 2; Player.slow = 0; }
    }
    updateUI();
    requestAnimationFrame(loop);
  };
  updateUI(); syncButtons(); applyVol(); loop();
  // avtomatik boshlashga urinish (brauzer ruxsat bersa)
  if (/autoplay=1/.test(location.search)) play();
}
window.__getWav = async () => { const b = await renderSoundtrack(DURATION); const wav = audioBufferToWav(b); window.__wav = wav; return wav.length; };
window.__wavChunk = (i, n) => { const a = window.__wav.subarray(i, i + n); let s = ''; for (let k = 0; k < a.length; k += 0x8000) s += String.fromCharCode.apply(null, a.subarray(k, k + 0x8000)); return btoa(s); };
window.addEventListener('load', bootPlayer);
window.__probe = t => { const w = worldAt(t); propsAt(t, [], w.W); const r = v => v && v.map(x => +x.toFixed(3)); return { mouth: r(w.W.foxMouth), flower: r(w.W.flowerHead), root: r(w.W.foxRoot), head: r(w.W.foxHead), paws: r(w.W.foxPawsMid), leafTip: r(w.W.leafTip), deerHead: r(w.W.deerHead), deerRoot: r(w.W.deerRoot) }; };

})();
