// packages/game-rules/src/economy.ts
// Iqtisodiyot formulalari va shaharning "lazy" simulyatsiyasi (last_simulated_at -> now).
// Kirish: CityEconomyState + vaqt oralig'i. Chiqish: yangi holat + hodisalar (ochlik, to'lib ketish).

import { CULTURES } from './cultures.js';
import { clamp } from './rng.js';
import type { Culture, ResourceKey, Resources } from './types.js';
import { RESOURCE_KEYS } from './types.js';

export const GROWTH = { cost: 1.6, time: 1.55, output: 1.25, storage: 1.4, housing: 1.3 } as const;
export const MAX_LEVEL = 10;

export type BuildingKey =
  | 'saroy' | 'ferma' | 'yogoch' | 'tosh_kon' | 'temir_kon' | 'otxona' | 'ombor' | 'mahalla'
  | 'kazarma' | 'temirchilik' | 'ustaxona' | 'devor' | 'minora' | 'bozor' | 'karvonsaroy'
  | 'ibodatxona' | 'akademiya' | 'elchixona' | 'qamoqxona';

export interface BuildingDef {
  key: BuildingKey;
  repeatable: boolean;
  baseCost: Partial<Resources>;
  baseTimeSec: number;
  baseOutput?: Partial<Resources>; // soatiga, 1-daraja
  baseWorkers: number; // 1-darajada; daraja bilan chiziqli o'sadi
}

const B = (key: BuildingKey, repeatable: boolean, baseCost: Partial<Resources>, baseTimeSec: number,
  baseWorkers: number, baseOutput?: Partial<Resources>): BuildingDef => ({ key, repeatable, baseCost, baseTimeSec, baseWorkers, baseOutput });

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  saroy: B('saroy', false, { wood: 300, stone: 300, gold: 200, iron: 50 }, 600, 0),
  ferma: B('ferma', true, { wood: 60, stone: 20 }, 60, 10, { food: 60 }),
  yogoch: B('yogoch', true, { wood: 40, stone: 30 }, 60, 10, { wood: 50 }),
  tosh_kon: B('tosh_kon', true, { wood: 60, stone: 20 }, 75, 12, { stone: 40 }),
  temir_kon: B('temir_kon', true, { wood: 80, stone: 60 }, 90, 14, { iron: 30 }),
  otxona: B('otxona', false, { wood: 100, stone: 50, gold: 50 }, 120, 6, { horses: 4 }),
  ombor: B('ombor', false, { wood: 80, stone: 80 }, 90, 2),
  mahalla: B('mahalla', true, { wood: 100, stone: 40 }, 90, 0),
  kazarma: B('kazarma', false, { wood: 120, stone: 80, gold: 40 }, 150, 4),
  temirchilik: B('temirchilik', false, { wood: 100, stone: 100, iron: 40, gold: 60 }, 180, 6),
  ustaxona: B('ustaxona', false, { wood: 250, iron: 80, gold: 100 }, 360, 8),
  devor: B('devor', false, { stone: 200, wood: 50 }, 300, 0),
  minora: B('minora', false, { stone: 150, wood: 80, iron: 20 }, 240, 2),
  bozor: B('bozor', false, { wood: 150, stone: 100, gold: 100 }, 200, 6),
  karvonsaroy: B('karvonsaroy', false, { wood: 200, stone: 200, gold: 150 }, 300, 6),
  ibodatxona: B('ibodatxona', false, { stone: 200, wood: 100, gold: 150 }, 300, 4),
  akademiya: B('akademiya', false, { stone: 250, wood: 150, gold: 300 }, 420, 8),
  elchixona: B('elchixona', false, { stone: 200, wood: 100, gold: 250 }, 360, 4),
  qamoqxona: B('qamoqxona', false, { stone: 250, iron: 80, gold: 100 }, 300, 4),
};

/** C(L) = C1 * 1.6^(L-1) */
export function costAt(key: BuildingKey, level: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const [r, v] of Object.entries(BUILDINGS[key].baseCost) as [ResourceKey, number][]) {
    out[r] = Math.round(v * GROWTH.cost ** (level - 1));
  }
  return out;
}

/** T(L) = T1 * 1.55^(L-1) * (1 - 0.03*(saroyL-1)) * (1 + madaniyat bonusi) ; soniyada */
export function buildTimeSec(key: BuildingKey, level: number, palaceLevel: number, culture: Culture): number {
  const palaceFactor = key === 'saroy' ? 1 : 1 - 0.03 * (palaceLevel - 1);
  return Math.round(BUILDINGS[key].baseTimeSec * GROWTH.time ** (level - 1) * palaceFactor * (1 + CULTURES[culture].bonuses.buildTime));
}

/** P(L) = P1 * 1.25^(L-1) ; soatiga */
export function baseOutputAt(key: BuildingKey, level: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const [r, v] of Object.entries(BUILDINGS[key].baseOutput ?? {}) as [ResourceKey, number][]) {
    out[r] = v * GROWTH.output ** (level - 1);
  }
  return out;
}

export const workersAt = (key: BuildingKey, level: number): number => BUILDINGS[key].baseWorkers * level;

/** Ombor sig'imi har bir resurs uchun: 1000 + 2000 * 1.4^(L-1); ombor yo'q bo'lsa 1000. Oltin uchun x2. */
export function storageCap(omborLevel: number, r: ResourceKey): number {
  const cap = omborLevel <= 0 ? 1000 : 1000 + Math.round(2000 * GROWTH.storage ** (omborLevel - 1));
  return r === 'gold' ? cap * 2 : cap;
}

/** Aholi sig'imi: 200 + sum(400 * 1.3^(L-1)) har bir mahalla uchun */
export function populationCap(mahallaLevels: number[]): number {
  return 200 + mahallaLevels.reduce((s, L) => s + Math.round(400 * GROWTH.housing ** (L - 1)), 0);
}

export const CITY_TIERS = ['qishloq', 'kichik_shahar', 'rivojlangan_shahar', 'katta_shahar', 'poytaxt'] as const;
export type CityTier = (typeof CITY_TIERS)[number];
const TIER_POP_MIN = [0, 800, 2000, 4500, 8000];

/** Shahar darajasi = min(saroy bo'yicha daraja, aholi bo'yicha daraja) */
export function cityTier(palaceLevel: number, population: number): CityTier {
  const byPalace = Math.min(4, Math.floor((palaceLevel - 1) / 2));
  let byPop = 0;
  for (let i = 0; i < TIER_POP_MIN.length; i++) if (population >= TIER_POP_MIN[i]!) byPop = i;
  return CITY_TIERS[Math.min(byPalace, byPop)]!;
}

export const BUILDING_SLOTS: Record<CityTier, number> = {
  qishloq: 12, kichik_shahar: 16, rivojlangan_shahar: 20, katta_shahar: 24, poytaxt: 30,
};

/** Baxt: H = clamp(60 - 1.5*(tau-10) + A + 10*[toq] - 40*[och] - W, 0, 100) */
export function happiness(taxPct: number, fed: boolean, amenity: number, warWeariness: number): number {
  return clamp(60 - 1.5 * (taxPct - 10) + Math.min(20, amenity) + (fed ? 10 : -40) - warWeariness, 0, 100);
}

/** Amenity = min(20, 2*L_ibodatxona + 1*L_bozor) */
export const amenity = (ibodatxonaL: number, bozorL: number): number => Math.min(20, 2 * ibodatxonaL + bozorL);

/** Mahsuldorlik: H<50 -> 0.5 + H/100 ; H>=50 -> 1 + (H-50)/250 (max 1.2) */
export const productivity = (H: number): number => (H < 50 ? 0.5 + H / 100 : 1 + (H - 50) / 250);

export const FOOD_PER_CITIZEN_H = 0.1;
export const WORKER_SHARE = 0.6;

export interface CityEconomyState {
  culture: Culture;
  population: number;
  taxPct: number; // 0..40
  stock: Resources;
  buildings: { key: BuildingKey; level: number }[];
  armyFoodPerHour: number; // shaharda turgan va shahar boqadigan qo'shinlar
  armyGoldPerHour: number; // maosh
  warWeariness: number; // 0..30
}

export interface Rates { production: Resources; consumption: Resources; happiness: number; workerFactor: number; popCap: number }

export function computeRates(s: CityEconomyState, fed: boolean): Rates {
  const lv = (k: BuildingKey) => s.buildings.filter(b => b.key === k).reduce((m, b) => Math.max(m, b.level), 0);
  const H = happiness(s.taxPct, fed, amenity(lv('ibodatxona'), lv('bozor')), s.warWeariness);
  const required = s.buildings.reduce((sum, b) => sum + workersAt(b.key, b.level), 0);
  const available = Math.floor(s.population * WORKER_SHARE);
  const workerFactor = required === 0 ? 1 : Math.min(1, available / required);
  const prod = { gold: 0, food: 0, wood: 0, stone: 0, iron: 0, horses: 0 } as Resources;
  const cb = CULTURES[s.culture].bonuses;
  for (const b of s.buildings) {
    for (const [r, v] of Object.entries(baseOutputAt(b.key, b.level)) as [ResourceKey, number][]) {
      prod[r] += v * workerFactor * productivity(H) * (1 + (cb.production[r] ?? 0));
    }
  }
  prod.gold += s.population * (s.taxPct / 100) * productivity(H) * (1 + (cb.production.gold ?? 0));
  const cons = { gold: s.armyGoldPerHour, food: s.population * FOOD_PER_CITIZEN_H + s.armyFoodPerHour, wood: 0, stone: 0, iron: 0, horses: 0 };
  const popCap = populationCap(s.buildings.filter(b => b.key === 'mahalla').map(b => b.level));
  return { production: prod, consumption: cons, happiness: H, workerFactor, popCap };
}

/** Logistik o'sish yopiq formulasi: P(t) = K / (1 + ((K-P0)/P0) e^{-g t}) */
export function logistic(P0: number, K: number, g: number, hours: number): number {
  if (P0 <= 0) return 0;
  return K / (1 + ((K - P0) / P0) * Math.exp(-g * hours));
}

export type EconomyEvent =
  | { type: 'starvation_started'; atMs: number }
  | { type: 'gold_depleted'; atMs: number }
  | { type: 'storage_full'; resource: ResourceKey; atMs: number };

/**
 * Shaharni fromMs dan toMs gacha simulyatsiya qiladi.
 * Qadam 15 daqiqa: har qadamda tezliklar o'zgarmas deb olinadi (piecewise-constant integratsiya).
 * 7 kunlik oflayn = 672 qadam, har bir shahar uchun < 1 ms. Juda uzun oraliqda qadamlar soni 2000 bilan cheklanadi.
 */
export function simulateCity(s0: CityEconomyState, fromMs: number, toMs: number): { state: CityEconomyState; events: EconomyEvent[] } {
  const STEP_MS = Math.max(15 * 60 * 1000, Math.ceil((toMs - fromMs) / 2000));
  const s: CityEconomyState = { ...s0, stock: { ...s0.stock } };
  const events: EconomyEvent[] = [];
  const omborL = s.buildings.find(b => b.key === 'ombor')?.level ?? 0;
  let t = fromMs;
  let fed = s.stock.food > 0;
  let full = new Set<ResourceKey>();
  while (t < toMs) {
    const dtMs = Math.min(STEP_MS, toMs - t);
    const h = dtMs / 3_600_000;
    const rates = computeRates(s, fed);
    for (const r of RESOURCE_KEYS) {
      const cap = storageCap(omborL, r);
      const next = s.stock[r] + (rates.production[r] - rates.consumption[r]) * h;
      if (next >= cap && !full.has(r)) { full.add(r); events.push({ type: 'storage_full', resource: r, atMs: t + dtMs }); }
      if (next < cap) full.delete(r);
      s.stock[r] = clamp(next, 0, cap);
    }
    const nowFed = s.stock.food > 0;
    if (fed && !nowFed) events.push({ type: 'starvation_started', atMs: t + dtMs });
    if (s.stock.gold === 0 && s.armyGoldPerHour > 0 && !events.some(e => e.type === 'gold_depleted')) events.push({ type: 'gold_depleted', atMs: t + dtMs });
    fed = nowFed;
    const g = fed ? 0.02 * (0.5 + rates.happiness / 100) * (1 + CULTURES[s.culture].bonuses.popGrowth) : 0;
    s.population = fed ? logistic(s.population, rates.popCap, g, h) : s.population * Math.exp(-0.01 * h);
    t += dtMs;
  }
  s.population = Math.floor(s.population);
  for (const r of RESOURCE_KEYS) s.stock[r] = Math.floor(s.stock[r]);
  return { state: s, events };
}

// ---------------- Bozor ----------------

/** NPC bozorining bazaviy narxlari (oltinda) */
export const MARKET_BASE_PRICE: Record<Exclude<ResourceKey, 'gold'>, number> = { food: 0.5, wood: 0.6, stone: 0.8, iron: 1.5, horses: 25 };
export const MARKET_FEE = 0.05;
export const MARKET_FEE_TRADE_PACT = 0.02;

/** p = clamp(p0 * e^(Q/V), 0.25*p0, 4*p0) ; Q = 24 soatdagi sof sotib olish, V = mintaqa likvidligi */
export const marketPrice = (p0: number, netBought24h: number, liquidity = 50_000): number =>
  clamp(p0 * Math.exp(netBought24h / liquidity), 0.25 * p0, 4 * p0);
