// apps/client/src/art/soldiers.ts
// Yon ko'rinishdagi askarlar (protsedural, Canvas 2D). Har millat o'z kiyimi, dubulg'asi, qalqoni va quroli bilan.
// Kadrlar keshlanadi: (millat, birlik, holat, kadr) -> offscreen canvas. O'ngga qaragan; chapga - ko'zgu.

import { unitDef, type Culture } from '@qirolliklar/game-rules';

export type Pose = 'walk' | 'attack' | 'dead' | 'idle';

interface Look { tunic: string; trim: string; pants: string; helmet: string; shield: string; shieldTrim: string; plume?: string }
export const LOOK: Record<Culture, Look> = {
  rus: { tunic: '#9e2a2b', trim: '#c9a227', pants: '#3b3b5c', helmet: '#a7b0ba', shield: '#b3312f', shieldTrim: '#e8c35a' },
  ingliz: { tunic: '#f1ece2', trim: '#b22234', pants: '#4a4f57', helmet: '#b9c0c8', shield: '#b22234', shieldTrim: '#f1ece2' },
  usmonli: { tunic: '#1e6b52', trim: '#c8102e', pants: '#7a1a1a', helmet: '#b8bec6', shield: '#c8102e', shieldTrim: '#d4a537', plume: '#ffffff' },
  temuriy: { tunic: '#1e3f8c', trim: '#d4a537', pants: '#5b4630', helmet: '#c3c9cf', shield: '#1f8a9e', shieldTrim: '#d4a537', plume: '#f4efe3' },
  mogul: { tunic: '#3a7bd5', trim: '#a61b1b', pants: '#4b3a2a', helmet: '#8d6a43', shield: '#a77b45', shieldTrim: '#5b3a1e' },
};
const SKIN = ['#e3b48c', '#d6a27a', '#c98f66'];

type Ctx = CanvasRenderingContext2D;
const line = (c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
};
const disc = (c: Ctx, x: number, y: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };

function helmet(c: Ctx, cu: Culture, unit: string, hx: number, hy: number, L: Look) {
  if (unit === 'yangicheri') { c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(hx - 4, hy - 2); c.lineTo(hx - 3, hy - 14); c.quadraticCurveTo(hx + 6, hy - 16, hx + 2, hy - 4); c.closePath(); c.fill(); return; }
  if (cu === 'rus') { c.fillStyle = L.helmet; c.beginPath(); c.moveTo(hx - 4.5, hy - 1); c.lineTo(hx, hy - 10); c.lineTo(hx + 4.5, hy - 1); c.fill(); line(c, hx + 2.5, hy - 1, hx + 2.5, hy + 3, 1.2, L.helmet); return; }
  if (cu === 'ingliz') { c.fillStyle = L.helmet; c.beginPath(); c.ellipse(hx, hy - 2, 6.5, 2, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(hx, hy - 2.5, 4, Math.PI, 0); c.fill(); return; }
  if (cu === 'usmonli') { c.fillStyle = L.plume!; c.beginPath(); c.ellipse(hx, hy - 3, 5, 3, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = L.helmet; c.beginPath(); c.moveTo(hx - 3, hy - 4); c.lineTo(hx, hy - 10); c.lineTo(hx + 3, hy - 4); c.fill(); return; }
  if (cu === 'temuriy') { c.fillStyle = L.helmet; c.beginPath(); c.moveTo(hx - 4, hy - 2); c.quadraticCurveTo(hx, hy - 13, hx + 4, hy - 2); c.fill(); c.fillStyle = L.plume!; c.fillRect(hx - 4.8, hy - 3.5, 9.6, 2.6); line(c, hx - 4, hy - 1, hx - 5, hy + 4, 2, '#8d96a0'); return; }
  c.fillStyle = '#6b4a2b'; c.fillRect(hx - 5, hy - 4, 10, 3); c.fillStyle = L.helmet; c.beginPath(); c.arc(hx, hy - 4, 4, Math.PI, 0); c.fill(); disc(c, hx, hy - 9, 1.2, L.trim);
}

function shieldShape(c: Ctx, cu: Culture, x: number, y: number, L: Look) {
  c.fillStyle = L.shield; c.strokeStyle = L.shieldTrim; c.lineWidth = 1.2;
  c.beginPath();
  if (cu === 'rus') { c.moveTo(x - 5, y - 8); c.quadraticCurveTo(x, y - 11, x + 5, y - 8); c.quadraticCurveTo(x + 5, y + 4, x, y + 10); c.quadraticCurveTo(x - 5, y + 4, x - 5, y - 8); }
  else if (cu === 'ingliz') { c.moveTo(x - 5, y - 7); c.lineTo(x + 5, y - 7); c.quadraticCurveTo(x + 5, y + 4, x, y + 8); c.quadraticCurveTo(x - 5, y + 4, x - 5, y - 7); }
  else c.arc(x, y, cu === 'mogul' ? 5 : 6.5, 0, Math.PI * 2);
  c.fill(); c.stroke();
  if (cu === 'ingliz') { c.fillStyle = L.shieldTrim; c.fillRect(x - 0.8, y - 6, 1.6, 12); c.fillRect(x - 4, y - 2, 8, 1.6); }
  else disc(c, x, y, 1.6, L.shieldTrim);
}

/** Piyoda turdagi odam (oyoqlar yerda y=0 da). ph: 0..1 animatsiya fazasi */
function human(c: Ctx, cu: Culture, unit: string, cls: string, pose: Pose, ph: number, skin: string) {
  const L = LOOK[cu];
  const step = pose === 'walk' ? Math.sin(ph * Math.PI * 2) : 0;
  // oyoqlar
  line(c, 0, -14, -2 + step * 4, 0, 3, L.pants);
  line(c, 0, -14, 2 - step * 4, 0, 3, shade(L.pants, 0.8));
  c.fillStyle = '#2a1d12'; c.fillRect(-4 + step * 4, -1.5, 4, 2); c.fillRect(0 - step * 4, -1.5, 4, 2);
  // tana (to'n)
  c.fillStyle = L.tunic; c.beginPath(); c.moveTo(-4.5, -26); c.lineTo(4.5, -26); c.lineTo(6, -11); c.lineTo(-6, -11); c.closePath(); c.fill();
  c.fillStyle = L.trim; c.fillRect(-6, -13, 12, 2); c.fillRect(-1, -26, 2, 13);
  // bosh
  disc(c, 0.5, -30, 4, skin);
  helmet(c, cu, unit, 0.5, -31, L);
  const swing = pose === 'attack' ? Math.sin(ph * Math.PI * 2) : 0;
  if (cls === 'kamonchi') {
    // kamon
    const draw = pose === 'attack' ? (ph < 0.6 ? ph / 0.6 : 0) : 0;
    c.strokeStyle = '#6b4423'; c.lineWidth = 1.6; c.beginPath(); c.arc(8, -22, 9, -Math.PI / 2.2, Math.PI / 2.2); c.stroke();
    line(c, 8 + 9 * Math.cos(Math.PI / 2.2), -22 - 9 * Math.sin(Math.PI / 2.2), 4 - draw * 5, -22, 0.7, '#ddd');
    line(c, 8 + 9 * Math.cos(Math.PI / 2.2), -22 + 9 * Math.sin(Math.PI / 2.2), 4 - draw * 5, -22, 0.7, '#ddd');
    line(c, 2, -23, 8, -22, 2.2, skin); line(c, -1, -23, 4 - draw * 5, -22, 2.2, skin);
    if (unit === 'uzun_kamonchi') { c.strokeStyle = '#5a3a1e'; c.lineWidth = 1.8; c.beginPath(); c.arc(8, -22, 13, -Math.PI / 2.1, Math.PI / 2.1); c.stroke(); }
    c.fillStyle = '#7a5230'; c.fillRect(-6, -27, 3, 10); // sadoq
  } else if (cls === 'nayzachi') {
    const thrust = pose === 'attack' ? Math.max(0, swing) * 6 : 0;
    line(c, -10 + thrust, -21, 22 + thrust, -24, 1.8, '#7a5230');
    c.fillStyle = '#d0d6dc'; c.beginPath(); c.moveTo(22 + thrust, -26); c.lineTo(28 + thrust, -24.2); c.lineTo(22 + thrust, -22.5); c.fill();
    line(c, 1, -23, 6 + thrust * 0.5, -22, 2.4, skin);
    shieldShape(c, cu, -4, -19, L);
  } else {
    // qilich/bolta
    const ang = pose === 'attack' ? -1.6 + (swing + 1) * 1.1 : -0.6;
    const hx = 4, hy = -23;
    line(c, 0, -23, hx, hy, 2.4, skin);
    const bx = hx + Math.cos(ang) * 12, by = hy + Math.sin(ang) * 12;
    line(c, hx, hy, bx, by, 1.8, '#dfe5ea');
    if (cu === 'rus' && unit !== 'drujina') { c.fillStyle = '#9aa3ad'; c.beginPath(); c.arc(bx, by, 3, ang - 1, ang + 1); c.fill(); }
    line(c, hx - Math.sin(ang) * 2.5, hy + Math.cos(ang) * 2.5, hx + Math.sin(ang) * 2.5, hy - Math.cos(ang) * 2.5, 1.6, '#c9a227');
    shieldShape(c, cu, -3, -19, L);
  }
}

function horse(c: Ctx, cu: Culture, heavy: boolean, ph: number, moving: boolean) {
  const L = LOOK[cu];
  const coat = cu === 'mogul' ? '#8a5a2b' : cu === 'temuriy' ? '#6b4226' : cu === 'ingliz' ? '#3b2a20' : '#5a3a22';
  const g = moving ? ph * Math.PI * 2 : 0;
  const leg = (x: number, o: number) => { const a = Math.sin(g + o) * (moving ? 0.6 : 0); line(c, x, -16, x + Math.sin(a) * 7, 0, 2.6, shade(coat, 0.8)); };
  leg(-11, 0); leg(-8, Math.PI); leg(9, Math.PI / 2); leg(12, Math.PI * 1.5);
  c.fillStyle = coat; c.beginPath(); c.ellipse(0, -20, 15, 7, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(10, -24); c.lineTo(17, -36); c.lineTo(22, -34); c.lineTo(15, -20); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(22, -34, 5, 3, 0.5, 0, Math.PI * 2); c.fill();
  line(c, -15, -21, -20, -12 + Math.sin(g) * 2, 2.5, '#2a1a10');
  if (heavy) { c.fillStyle = L.tunic; c.beginPath(); c.moveTo(-15, -24); c.lineTo(14, -24); c.lineTo(12, -10); c.lineTo(-14, -10); c.closePath(); c.fill(); c.fillStyle = L.trim; c.fillRect(-14, -12, 26, 2); }
  c.fillStyle = L.trim; c.fillRect(-4, -27, 9, 3);
}

function rider(c: Ctx, cu: Culture, unit: string, heavy: boolean, pose: Pose, ph: number, skin: string) {
  const L = LOOK[cu];
  c.fillStyle = L.tunic; c.fillRect(-4, -42, 9, 14);
  c.fillStyle = L.trim; c.fillRect(-4, -31, 9, 2);
  line(c, 0, -29, 5, -21, 3, L.pants);
  disc(c, 0.5, -46, 4, skin);
  helmet(c, cu, unit, 0.5, -47, L);
  const swing = pose === 'attack' ? Math.sin(ph * Math.PI * 2) : 0;
  if (unit === 'manggut' || (cu === 'mogul' && unit === 'otliq')) {
    c.strokeStyle = '#6b4423'; c.lineWidth = 1.6; c.beginPath(); c.arc(9, -38, 8, -Math.PI / 2.2, Math.PI / 2.2); c.stroke();
    line(c, 2, -39, 9, -38, 2.2, skin);
  } else if (heavy) {
    const dip = pose === 'attack' ? Math.max(0, swing) * 0.15 : 0;
    line(c, -8, -38, 30, -44 + dip * 40, 2.2, '#7a5230');
    c.fillStyle = L.trim; c.beginPath(); c.moveTo(24, -45 + dip * 40); c.lineTo(18, -48 + dip * 40); c.lineTo(18, -43 + dip * 40); c.fill();
    shieldShape(c, cu, -3, -34, L);
  } else {
    const ang = pose === 'attack' ? -1.8 + (swing + 1) * 1.2 : -0.9;
    line(c, 2, -39, 6, -40, 2.4, skin);
    line(c, 6, -40, 6 + Math.cos(ang) * 13, -40 + Math.sin(ang) * 13, 1.8, '#dfe5ea');
  }
}

function elephant(c: Ctx, cu: Culture, ph: number, moving: boolean) {
  const L = LOOK[cu]; const g = moving ? ph * Math.PI * 2 : 0;
  for (const [x, o] of [[-14, 0], [-7, Math.PI], [10, Math.PI / 2], [16, Math.PI * 1.5]] as const) { c.fillStyle = '#6f6f73'; c.fillRect(x - 3 + Math.sin(g + o) * 2, -18, 7, 18); }
  c.fillStyle = '#86868b'; c.beginPath(); c.ellipse(0, -28, 22, 14, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(22, -34, 9, 10, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#86868b'; c.lineWidth = 5; c.beginPath(); c.moveTo(28, -30); c.quadraticCurveTo(36, -18 + Math.sin(g) * 3, 30, -6); c.stroke();
  line(c, 26, -27, 34, -22, 2, '#f2efe6');
  c.fillStyle = L.tunic; c.fillRect(-14, -46, 24, 10); c.fillStyle = L.trim; c.fillRect(-14, -38, 24, 2);
  c.fillStyle = L.shield; c.beginPath(); c.moveTo(-14, -46); c.lineTo(-2, -56); c.lineTo(10, -46); c.fill();
}

function siege(c: Ctx, cu: Culture, unit: string, ph: number, pose: Pose) {
  if (unit === 'shohi_top') {
    c.fillStyle = '#5b3a1e'; c.fillRect(-14, -8, 24, 6); disc(c, -9, -3, 5, '#3b2a1a'); disc(c, 7, -3, 5, '#3b2a1a');
    c.save(); c.translate(-2, -10); c.rotate(-0.15); c.fillStyle = '#b08d57'; c.fillRect(-12, -4, 32, 8); c.fillStyle = '#8a6c3f'; c.fillRect(18, -5, 3, 10); c.restore();
    if (pose === 'attack' && ph < 0.25) { disc(c, 24, -14, 6 * (1 - ph * 4) + 2, '#ffcf6b'); disc(c, 26, -15, 9 * ph * 4, 'rgba(200,200,200,0.5)'); }
    return;
  }
  const arm = pose === 'attack' ? -1.2 + Math.min(1, ph * 3) * 2.2 : -1.2;
  c.fillStyle = '#6b4423'; c.fillRect(-16, -6, 32, 5); disc(c, -11, -2, 4, '#3b2a1a'); disc(c, 11, -2, 4, '#3b2a1a');
  line(c, -8, -6, 0, -26, 3, '#7a5230'); line(c, 8, -6, 0, -26, 3, '#7a5230');
  const ax = Math.cos(arm) * 22, ay = Math.sin(arm) * 22;
  line(c, -ax * 0.5, -26 - ay * 0.5, ax, -26 + ay, 2.6, '#5a3a1e');
  if (unit === 'xitoy_manjaniq') { c.fillStyle = '#a61b1b'; c.fillRect(-4, -30, 8, 4); }
  disc(c, ax, -26 + ay, 3, '#6d6a66');
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)));
  return `#${((k((n >> 16) & 255) << 16) | (k((n >> 8) & 255) << 8) | k(n & 255)).toString(16).padStart(6, '0')}`;
}

/** Bitta askarni (0,0 = oyoq ostida markaz) chizadi */
export function drawUnit(c: Ctx, cu: Culture, unitKey: string, pose: Pose, ph: number, skinIdx = 0) {
  const u = unitDef(unitKey); const skin = SKIN[skinIdx % SKIN.length]!;
  if (pose === 'dead') {
    c.save(); c.rotate(-Math.PI / 2); c.translate(4, 0);
    if (u.cls === 'otliq' || u.cls === 'ogir_otliq') { if (unitKey === 'jangovar_fil') elephant(c, cu, 0, false); else horse(c, cu, u.cls === 'ogir_otliq', 0, false); }
    else if (u.cls === 'qamal') siege(c, cu, unitKey, 0, 'idle');
    else human(c, cu, unitKey, u.cls, 'idle', 0, skin);
    c.restore();
    c.fillStyle = 'rgba(120,20,20,0.35)'; c.beginPath(); c.ellipse(6, 0, 10, 2.5, 0, 0, Math.PI * 2); c.fill();
    return;
  }
  if (unitKey === 'jangovar_fil') return elephant(c, cu, ph, pose === 'walk');
  if (u.cls === 'otliq' || u.cls === 'ogir_otliq') { horse(c, cu, u.cls === 'ogir_otliq', ph, pose === 'walk' || pose === 'attack'); rider(c, cu, unitKey, u.cls === 'ogir_otliq', pose, ph, skin); return; }
  if (u.cls === 'qamal') return siege(c, cu, unitKey, ph, pose);
  human(c, cu, unitKey, u.cls, pose, ph, skin);
}

// ---- kesh: 64x72 kadrlar, 2x sifat
const cache = new Map<string, HTMLCanvasElement>();
export const FRAME_W = 72, FRAME_H = 76, FRAMES = 6;
export function unitFrame(cu: Culture, unitKey: string, pose: Pose, frame: number, skinIdx: number): HTMLCanvasElement {
  const key = `${cu}|${unitKey}|${pose}|${frame}|${skinIdx}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = FRAME_W * 2; cv.height = FRAME_H * 2;
  const c = cv.getContext('2d')!;
  c.scale(2, 2); c.translate(FRAME_W / 2 - 4, FRAME_H - 6);
  // soya
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(0, 0, unitDef(unitKey).cls === 'otliq' || unitDef(unitKey).cls === 'ogir_otliq' ? 16 : 7, 2.2, 0, 0, Math.PI * 2); c.fill();
  drawUnit(c, cu, unitKey, pose, frame / FRAMES, skinIdx);
  cache.set(key, cv);
  return cv;
}
