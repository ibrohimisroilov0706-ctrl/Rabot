// apps/client/src/g3d/scene.ts
// Sinov maydoni: tepaliklar, yo'l, daryo bo'yi, o'rmon, qoyalar, ikki lager (chodirlar, bayroqlar), yog'och qo'rg'on.
// Hammasi bitta-ikkita katta buferga birlashtiriladi.

import { valueNoise } from '@qirolliklar/game-rules';
import { CIVS, type CivKey } from './civs.js';
import type { Env, Mesh, Renderer } from './engine/gl.js';
import { clamp, lerp } from './engine/math.js';
import { Geo, at, hex, shadeC, type RGB } from './engine/mesh.js';

export const WORLD = 70; // -70..70 m

export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = (valueNoise(x / 22 + 40, z / 22 + 40, 3) - 0.5) * 6 + (valueNoise(x / 7 + 9, z / 7 + 9, 4) - 0.5) * 0.9;
  h *= 0.25 + 0.75 * clamp((r - 12) / 30, 0, 1);       // markaz tekisroq
  h += Math.max(0, r - 46) * 0.55;                       // chekkada tog'lar
  if (Math.abs(x) < 3 && r < 60) h -= 0.15 * (1 - Math.abs(x) / 3); // yo'l chuqurchasi
  return h;
}

const GRASS: RGB = hex('#6f9a45'), GRASS2: RGB = hex('#86ad52'), DIRT: RGB = hex('#9c8458'), ROCK: RGB = hex('#8a8578'), SNOW: RGB = hex('#eef0ee');

function terrain(): Geo {
  const g = new Geo(); const S = 2; const N = WORLD / S;
  const col = (x: number, z: number, y: number): RGB => {
    const n = valueNoise(x / 5, z / 5, 8);
    let c: RGB = [lerp(GRASS[0], GRASS2[0], n), lerp(GRASS[1], GRASS2[1], n), lerp(GRASS[2], GRASS2[2], n)];
    if (Math.abs(x) < 2.6 && Math.hypot(x, z) < 60) c = DIRT;
    if (y > 6) c = ROCK; if (y > 13) c = SNOW;
    return c;
  };
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S;
    const a = [x0, heightAt(x0, z0), z0], b = [x1, heightAt(x1, z0), z0], c = [x1, heightAt(x1, z1), z1], d = [x0, heightAt(x0, z1), z1];
    const cc = col(x0 + 1, z0 + 1, (a[1]! + c[1]!) / 2);
    const I = at(0, 0, 0);
    g.tri(I, a, c, b, shadeC(cc, 0.97 + valueNoise(i, j, 2) * 0.06)); g.tri(I, a, d, c, cc);
  }
  return g;
}

function pine(g: Geo, x: number, z: number, s: number) {
  const y = heightAt(x, z);
  g.cyl(x, y, z, 0.12 * s, 0.1 * s, 1.2 * s, 5, '#5b3a1e');
  for (let k = 0; k < 3; k++) g.cyl(x, y + (0.9 + k * 0.85) * s, z, (1.3 - k * 0.32) * s, 0, 1.5 * s, 7, k % 2 ? '#3d6b3a' : '#2f5d34', undefined, true);
}
function leafy(g: Geo, x: number, z: number, s: number) {
  const y = heightAt(x, z);
  g.cyl(x, y, z, 0.16 * s, 0.12 * s, 1.6 * s, 5, '#6b4423');
  g.sphere(x, y + 2.3 * s, z, 1.1 * s, 7, '#4f7f3a', undefined, 0.85).sphere(x + 0.5 * s, y + 2.7 * s, z + 0.2 * s, 0.7 * s, 6, '#6a9b4a');
}
function rock(g: Geo, x: number, z: number, s: number, rot: number) {
  const y = heightAt(x, z);
  g.box(0, 0.25 * s, 0, 1.2 * s, 0.7 * s, 0.9 * s, '#8b867c', at(x, y, z, rot, 0.1, 0.15));
  g.box(0.3 * s, 0.55 * s, 0.1 * s, 0.6 * s, 0.5 * s, 0.6 * s, '#9d978b', at(x, y, z, rot + 0.5, 0, 0.2));
}
function tent(g: Geo, x: number, z: number, civ: CivKey, rot: number) {
  const L = CIVS[civ].look; const y = heightAt(x, z);
  const m = at(x, y, z, rot);
  g.cyl(0, 0, 0, 1.8, 0, 2.4, 8, L.cloth === '#f4efe3' || L.cloth === '#f4f1ea' ? L.cloth : L.tunic, m);
  g.cyl(0, 0, 0, 1.85, 1.7, 0.35, 8, L.trim, m, false);
  g.box(0, 0.6, 1.7, 0.6, 1.2, 0.05, '#2a1d12', m);
}
export function banner(g: Geo, x: number, z: number, civ: CivKey, h = 4.2) {
  const F = CIVS[civ].flag; const y = heightAt(x, z);
  g.cyl(x, y, z, 0.07, 0.06, h, 5, '#4a3320').sphere(x, y + h + 0.05, z, 0.1, 5, '#d4a537');
  g.plane([[x, y + h - 0.1, z], [x + 1.4, y + h - 0.15, z], [x + 1.4, y + h - 1.0, z], [x, y + h - 0.95, z]], F.bg);
  const ex = x + 0.7, ey = y + h - 0.55;
  const P = (pts: [number, number][]) => g.plane(pts.map(([dx, dy]) => [ex + dx, ey + dy, z + 0.02]) as number[][], F.fg);
  if (F.emblem === 'cross') { P([[-0.08, 0.4], [0.08, 0.4], [0.08, -0.4], [-0.08, -0.4]]); P([[-0.68, 0.08], [0.68, 0.08], [0.68, -0.08], [-0.68, -0.08]]); }
  else if (F.emblem === 'rings') { for (const [dx, dy] of [[-0.18, 0.12], [0.18, 0.12], [0, -0.16]]) g.cyl(ex + dx!, ey + dy!, z + 0.02, 0.12, 0.12, 0.02, 8, F.fg, at(0, 0, 0, 0, Math.PI / 2, 0)); }
  else if (F.emblem === 'crescent') { g.cyl(0, 0, 0, 0.25, 0.25, 0.02, 10, F.fg, at(ex - 0.05, ey, z + 0.02, 0, Math.PI / 2, 0)); g.cyl(0, 0, 0, 0.2, 0.2, 0.02, 10, F.bg, at(ex + 0.05, ey, z + 0.035, 0, Math.PI / 2, 0)); }
  else if (F.emblem === 'sun') { g.cyl(0, 0, 0, 0.22, 0.22, 0.02, 10, F.fg, at(ex, ey, z + 0.02, 0, Math.PI / 2, 0)); }
  else if (F.emblem === 'star') { P([[0, 0.3], [0.1, 0.05], [0, -0.3], [-0.1, 0.05]]); P([[-0.3, 0], [0, 0.1], [0.3, 0], [0, -0.1]]); }
  else { P([[-0.6, 0.38], [0.6, 0.38], [0.6, 0.3], [-0.6, 0.3]]); P([[-0.6, -0.3], [0.6, -0.3], [0.6, -0.38], [-0.6, -0.38]]); }
}
function palisade(g: Geo, cx: number, cz: number) {
  // yog'och qo'rg'on: oldingi devor darvoza bilan, ikki minora
  for (let x = -14; x <= 14; x += 0.55) {
    if (Math.abs(x) < 2.2) continue;
    const y = heightAt(cx + x, cz); const hgt = 3.4 + valueNoise(x * 3, 1, 6) * 0.5;
    g.cyl(cx + x, y - 0.3, cz, 0.27, 0.25, hgt, 6, '#7a5230').cyl(cx + x, y - 0.3 + hgt, cz, 0.25, 0, 0.5, 6, '#6b4423');
  }
  for (const s of [-1, 1]) {
    const x = cx + s * 3.2, y = heightAt(x, cz);
    g.box(x, y + 2.6, cz, 2.2, 5.2, 2.2, '#6b4423').box(x, y + 5.4, cz, 2.8, 0.3, 2.8, '#5b3a1e');
    g.cyl(x, y + 5.5, cz, 2.0, 0, 1.6, 4, '#8e3b2a');
  }
  g.box(cx, heightAt(cx, cz) + 3.6, cz, 4.4, 0.5, 0.6, '#5b3a1e');
}

export interface Scene3D { terrain: Mesh; props: Mesh; sky: Mesh; shadow: Mesh; spark: Mesh }

export function buildScene(r: Renderer, myCiv: CivKey, enemyCiv: CivKey): Scene3D {
  const t = terrain();
  const p = new Geo();
  // daraxtlar va qoyalar (deterministik)
  for (let i = 0; i < 260; i++) {
    const a = valueNoise(i * 1.31, 7.7, 11) * Math.PI * 2 * 3, rr = 16 + valueNoise(i * 2.17, 3.3, 12) * 44;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    if (Math.abs(x) < 4.5 || heightAt(x, z) > 9) continue;
    if (Math.hypot(x, z - 30) < 10 || Math.hypot(x, z + 34) < 16) continue;
    const k = valueNoise(i * 0.7, 1.1, 13);
    if (k < 0.12) rock(p, x, z, 0.8 + k * 6, a); else if (k < 0.62) pine(p, x, z, 0.8 + k * 0.6); else leafy(p, x, z, 0.75 + k * 0.4);
  }
  // lagerlar
  for (const [i, dx] of [-7, -3.5, 3.5, 7].entries()) tent(p, dx, 33 + (i % 2) * 2, myCiv, Math.PI + dx * 0.05);
  banner(p, -2.2, 26, myCiv); banner(p, 2.2, 26, myCiv);
  for (const [i, dx] of [-9, -5, 5, 9].entries()) tent(p, dx, -27 - (i % 2) * 2, enemyCiv, dx * 0.05);
  banner(p, -2.4, -24, enemyCiv); banner(p, 2.4, -24, enemyCiv);
  palisade(p, 0, -36);
  // pichan, to'siqlar
  for (const [x, z] of [[-6, 20], [6.5, 21], [-8, -18], [8, -17]] as [number, number][]) p.cyl(x, heightAt(x, z), z, 0.8, 0.5, 1.1, 8, '#d8b24a');
  for (let x = -12; x <= -6; x += 1.5) p.box(x, heightAt(x, 14) + 0.5, 14, 1.5, 0.08, 0.08, '#6b4423').box(x - 0.75, heightAt(x, 14) + 0.4, 14, 0.1, 0.8, 0.1, '#5b3a1e');
  // osmon gumbazi (rangni shader tint bilan o'zgartiramiz)
  const sky = new Geo();
  const rings = 8, seg = 16, R = 260;
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const th0 = (j / rings) * Math.PI / 2, th1 = ((j + 1) / rings) * Math.PI / 2;
    const P = (th: number, ph: number) => [Math.sin(ph) * Math.cos(th) * R, Math.sin(th) * R - 20, Math.cos(ph) * Math.cos(th) * R];
    const c0 = shadeC(hex('#cfe6f7'), 1 - j / rings * 0.35), cTop = hex('#4f8fd0');
    const k = j / rings; const cc: RGB = [lerp(c0[0], cTop[0], k), lerp(c0[1], cTop[1], k), lerp(c0[2], cTop[2], k)];
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    sky.quad(at(0, 0, 0), P(th0, a0), P(th0, a1), P(th1, a1), P(th1, a0), cc);
  }
  const shadow = new Geo().cyl(0, 0, 0, 0.45, 0.45, 0.01, 12, '#000000', undefined, true);
  const spark = new Geo().box(0, 0, 0, 0.07, 0.07, 0.07, '#ffffff');
  return { terrain: r.upload(t), props: r.upload(p), sky: r.upload(sky), shadow: r.upload(shadow), spark: r.upload(spark) };
}

/** Kun-tun: t 0..1 (0.25 tong, 0.5 tush, 0.75 kech) */
export function envAt(t: number): Env {
  const day = clamp(Math.sin((t - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0, 1); // 0 tun, 1 tush
  const dusk = clamp(1 - Math.abs(day - 0.35) * 4, 0, 1) * 0.8;
  const sunA = (t - 0.25) * Math.PI * 2;
  const k = 0.25 + day * 0.75;
  const fog: [number, number, number] = [lerp(0.08, 0.74, day) + dusk * 0.15, lerp(0.1, 0.83, day) + dusk * 0.05, lerp(0.2, 0.92, day) - dusk * 0.1];
  return {
    sky: [0.42 * k + dusk * 0.1, 0.46 * k, 0.55 * k],
    ground: [0.3 * k, 0.27 * k, 0.22 * k],
    sun: [0.78 * day + dusk * 0.3, 0.72 * day + dusk * 0.1, 0.6 * day],
    sunDir: [Math.cos(sunA) * 0.6 + 0.2, Math.max(0.15, Math.sin(sunA)), 0.45],
    fog, fogNear: 30, fogFar: 140,
  };
}
