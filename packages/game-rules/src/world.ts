// packages/game-rules/src/world.ts
// Dunyo geometriyasi: millat mintaqalari, deterministik terren, ob-havo, masofa va yurish vaqti.
// Terren saqlanmaydi: (x, y) dan har doim bir xil hisoblanadi, shuning uchun server va klient mos keladi.

import { CULTURES } from './cultures.js';
import { hashSeed } from './rng.js';
import type { Culture, Terrain, Weather } from './types.js';
import { unitDef } from './units.js';

export const MAP_SIZE = 128; // prototip (D-01). Prod: 512
export const REGION_SIZE = 8;
export const REGIONS_PER_SIDE = MAP_SIZE / REGION_SIZE;

export const regionOf = (x: number, y: number) => ({ rx: Math.floor(x / REGION_SIZE), ry: Math.floor(y / REGION_SIZE) });
export const regionId = (rx: number, ry: number): number => ry * REGIONS_PER_SIDE + rx;

/** Millat mintaqasi (128x128 prototip xaritasi uchun) */
export function cultureZone(x: number, y: number): Culture {
  if (y < 40) return 'rus';
  if (x >= 84) return 'mogul';
  if (y >= 84 && x < 64) return 'usmonli';
  if (x < 44) return 'ingliz';
  return 'temuriy';
}

/** Zonaning o'rtacha nuqtasi atrofida spawn qidirish uchun chegaralar */
export const ZONE_BOUNDS: Record<Culture, { x0: number; y0: number; x1: number; y1: number }> = {
  rus: { x0: 4, y0: 4, x1: 123, y1: 38 },
  ingliz: { x0: 4, y0: 42, x1: 42, y1: 82 },
  usmonli: { x0: 4, y0: 86, x1: 62, y1: 123 },
  temuriy: { x0: 46, y0: 42, x1: 82, y1: 123 },
  mogul: { x0: 86, y0: 42, x1: 123, y1: 123 },
};

function lattice(ix: number, iy: number, salt: number): number {
  return hashSeed(`${ix}:${iy}:${salt}`) / 4294967296;
}
/** Silliq qiymat shovqini [0,1) */
export function valueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = lattice(ix, iy, salt), b = lattice(ix + 1, iy, salt), c = lattice(ix, iy + 1, salt), d = lattice(ix + 1, iy + 1, salt);
  const u = s(fx), v = s(fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Deterministik terren */
export function terrainAt(x: number, y: number): Terrain {
  const river = Math.abs(valueNoise(x / 22, y / 22, 7) - 0.5);
  if (river < 0.018) return 'daryo';
  const n = valueNoise(x / 10, y / 10, 1) * 0.7 + valueNoise(x / 4, y / 4, 2) * 0.3;
  const zone = cultureZone(x, y);
  const t: Record<Culture, [number, Terrain][]> = {
    rus: [[0.55, 'ormon'], [0.8, 'tekislik'], [1, 'tog']],
    ingliz: [[0.25, 'ormon'], [0.85, 'tekislik'], [1, 'tog']],
    usmonli: [[0.15, 'ormon'], [0.6, 'tekislik'], [1, 'tog']],
    temuriy: [[0.4, 'chol'], [0.8, 'tekislik'], [1, 'tog']],
    mogul: [[0.5, 'tekislik'], [0.85, 'chol'], [1, 'tog']],
  };
  for (const [lim, ter] of t[zone]) if (n < lim) return ter;
  return 'tekislik';
}

export const TERRAIN_MOVE: Record<Terrain, number> = { tekislik: 1, ormon: 0.7, tog: 0.5, chol: 0.8, daryo: 0.5 };
const WEATHER_TABLE: Record<Culture, [number, Weather][]> = {
  rus: [[0.45, 'ochiq'], [0.65, 'qor'], [0.85, 'yomgir'], [1, 'tuman']],
  ingliz: [[0.4, 'ochiq'], [0.75, 'yomgir'], [1, 'tuman']],
  usmonli: [[0.6, 'ochiq'], [0.75, 'yomgir'], [0.95, 'jazirama'], [1, 'tuman']],
  temuriy: [[0.6, 'ochiq'], [0.9, 'jazirama'], [1, 'yomgir']],
  mogul: [[0.55, 'ochiq'], [0.75, 'qor'], [0.9, 'jazirama'], [1, 'tuman']],
};
/** Ob-havo: har viloyatda 6 soatda bir yangilanadi */
export function weatherAt(x: number, y: number, nowMs: number): Weather {
  const { rx, ry } = regionOf(x, y);
  const slot = Math.floor(nowMs / (6 * 3_600_000));
  const u = hashSeed(`w:${rx}:${ry}:${slot}`) / 4294967296;
  for (const [lim, w] of WEATHER_TABLE[cultureZone(x, y)]) if (u < lim) return w;
  return 'ochiq';
}

export const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

/** Yo'l bo'yidagi terrenlar bo'yicha o'rtacha tezlik ko'paytuvchisi (16 nuqtada o'lchanadi) */
export function pathTerrainFactor(ax: number, ay: number, bx: number, by: number, culture: Culture): number {
  const N = 16; let sum = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const ter = terrainAt(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t));
    let f = TERRAIN_MOVE[ter];
    if (ter === 'daryo') f *= 1 + CULTURES[culture].bonuses.riverSpeed;
    if (f < 1 && CULTURES[culture].bonuses.terrainAdapted.includes(ter)) f = 1;
    sum += 1 / f; // vaqt ulushlari yig'iladi
  }
  return N / sum;
}

/** Yurish vaqti (ms): masofa / (eng sekin birlik tezligi * terren * madaniyat) */
export function marchDurationMs(unitKeys: string[], culture: Culture, ax: number, ay: number, bx: number, by: number): number {
  if (unitKeys.length === 0) return 0;
  const slowest = Math.min(...unitKeys.map(k => unitDef(k).speed));
  const speed = slowest * pathTerrainFactor(ax, ay, bx, by, culture) * (1 + CULTURES[culture].bonuses.marchSpeed);
  const hours = distance(ax, ay, bx, by) / speed;
  return Math.max(60_000, Math.round(hours * 3_600_000));
}

/** Prototipda vaqtni tezlashtirish uchun (GAME_SPEED=10 -> hamma narsa 10x tez) */
export const scaleDuration = (ms: number, gameSpeed: number): number => Math.max(1000, Math.round(ms / Math.max(1, gameSpeed)));
