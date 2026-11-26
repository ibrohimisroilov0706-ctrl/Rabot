// apps/server/src/services/city.ts
// Shaharni "lazy" simulyatsiya qilish: last_simulated_at dan hozirgacha (o'yin vaqtida) hisoblab saqlaydi.
// Kirish: cityId. Chiqish: yangilangan shahar holati + ko'rsatish uchun tezliklar.

import {
  BUILDING_SLOTS, BASE_UNITS, CULTURES, computeRates, cityTier, simulateCity, storageCap, unitDef,
  RESOURCE_KEYS, type BuildingKey, type CityEconomyState, type Culture, type Resources,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { notFound } from '../http/router.js';
import { gameMs, notify, type Game } from './common.js';

export interface CityRow {
  id: string; kingdom_id: string; name: string; x: number; y: number; population: number; tax_pct: number;
  happiness: number; low_happiness_since: Date | null; war_weariness: number; wall_hp: number; last_simulated_at: Date;
}
export interface BuildingRow { id: string; key: BuildingKey; level: number; slot: number }

export interface SyncedCity {
  city: CityRow;
  culture: Culture;
  isCapital: boolean;
  resources: Resources;
  buildings: BuildingRow[];
  level: (k: BuildingKey) => number;
  upkeep: { food: number; gold: number };
  rates: ReturnType<typeof computeRates>;
  caps: Resources;
  tier: ReturnType<typeof cityTier>;
  slots: number;
}

export async function armyUpkeep(t: Tx, cityId: string, kingdomId: string, isCapital: boolean, culture: Culture) {
  const rows = await many<{ unit_key: string; n: number; own: boolean }>(t, `
    SELECT au.unit_key, SUM(au.count)::int AS n, (a.serving_kingdom_id IS NULL) AS own
    FROM armies a JOIN army_units au ON au.army_id = a.id
    WHERE (a.home_city_id = $1 AND a.serving_kingdom_id IS NULL) OR ($3 AND a.serving_kingdom_id = $2)
    GROUP BY au.unit_key, own`, [cityId, kingdomId, isCapital]);
  let food = 0, gold = 0;
  for (const r of rows) {
    const u = unitDef(r.unit_key);
    food += r.n * u.foodPerHour;
    if (r.own) gold += r.n * u.goldPerHour * (1 + CULTURES[culture].bonuses.upkeepGold);
  }
  return { food, gold };
}

/** Shaharni qulflaydi (FOR UPDATE), hozirgi vaqtgacha simulyatsiya qiladi va saqlaydi. */
export async function syncCity(t: Tx, g: Game, cityId: string, nowMs = Date.now()): Promise<SyncedCity> {
  const city = await one<CityRow & { culture: Culture; capital_city_id: string }>(t, `
    SELECT c.*, k.culture, k.capital_city_id FROM cities c JOIN kingdoms k ON k.id = c.kingdom_id
    WHERE c.id = $1 FOR UPDATE OF c`, [cityId]);
  if (!city) throw notFound('Shahar topilmadi');
  const res = await one<Resources & { city_id: string }>(t, 'SELECT * FROM resources WHERE city_id = $1 FOR UPDATE', [cityId]);
  const buildings = await many<BuildingRow>(t, 'SELECT id, key, level, slot FROM buildings WHERE city_id = $1 ORDER BY slot', [cityId]);
  const isCapital = city.capital_city_id === city.id;
  const upkeep = await armyUpkeep(t, cityId, city.kingdom_id, isCapital, city.culture);

  const state: CityEconomyState = {
    culture: city.culture,
    population: city.population,
    taxPct: city.tax_pct,
    stock: { gold: res!.gold, food: res!.food, wood: res!.wood, stone: res!.stone, iron: res!.iron, horses: res!.horses },
    buildings: buildings.filter(b => b.level > 0).map(b => ({ key: b.key, level: b.level })),
    armyFoodPerHour: upkeep.food,
    armyGoldPerHour: upkeep.gold,
    warWeariness: city.war_weariness,
  };
  const fromMs = city.last_simulated_at.getTime();
  const elapsedGame = gameMs(g, Math.max(0, nowMs - fromMs));
  const { state: next, events } = simulateCity(state, 0, elapsedGame);
  const fed = next.stock.food > 0;
  const rates = computeRates(next, fed);
  const H = Math.round(rates.happiness);
  const lowSince = H < 15 ? (city.low_happiness_since ?? new Date(nowMs)) : null;

  await t.query(`UPDATE cities SET population = $2, happiness = $3, low_happiness_since = $4, last_simulated_at = $5 WHERE id = $1`,
    [cityId, next.population, H, lowSince, new Date(nowMs)]);
  await t.query('UPDATE resources SET gold=$2, food=$3, wood=$4, stone=$5, iron=$6, horses=$7 WHERE city_id=$1',
    [cityId, next.stock.gold, next.stock.food, next.stock.wood, next.stock.stone, next.stock.iron, next.stock.horses]);

  if (events.some(e => e.type === 'starvation_started')) {
    await notify(t, city.kingdom_id, 'ochlik', `${city.name}: oziq tugadi`, 'Aholi kamaymoqda, qo\'shin kuchi 30% ga tushdi. Ferma quring yoki oziq sotib oling.');
  }

  const level = (k: BuildingKey) => buildings.filter(b => b.key === k).reduce((m, b) => Math.max(m, b.level), 0);
  const omborL = level('ombor');
  const caps = Object.fromEntries(RESOURCE_KEYS.map(k => [k, storageCap(omborL, k)])) as Resources;
  const tier = cityTier(Math.max(1, level('saroy')), next.population);
  city.population = next.population; city.happiness = H; city.last_simulated_at = new Date(nowMs);
  return { city, culture: city.culture, isCapital, resources: next.stock, buildings, level, upkeep, rates, caps, tier, slots: BUILDING_SLOTS[tier] };
}

export async function capitalOf(t: Tx, kingdomId: string): Promise<string> {
  const r = await one<{ capital_city_id: string }>(t, 'SELECT capital_city_id FROM kingdoms WHERE id = $1', [kingdomId]);
  if (!r?.capital_city_id) throw notFound('Poytaxt topilmadi');
  return r.capital_city_id;
}

/** Klientga yuboriladigan ko'rinish (tezliklar o'yin soatiga) */
export function cityView(s: SyncedCity) {
  return {
    id: s.city.id, name: s.city.name, x: s.city.x, y: s.city.y,
    population: Math.floor(s.city.population), populationCap: s.rates.popCap,
    taxPct: s.city.tax_pct, happiness: s.city.happiness, wallHp: s.city.wall_hp,
    tier: s.tier, slots: s.slots,
    resources: Object.fromEntries(RESOURCE_KEYS.map(k => [k, Math.floor(s.resources[k])])),
    caps: s.caps,
    perHour: Object.fromEntries(RESOURCE_KEYS.map(k => [k, Math.round((s.rates.production[k] - s.rates.consumption[k]) * 10) / 10])),
    workerFactor: Math.round(s.rates.workerFactor * 100) / 100,
    upkeep: { food: Math.round(s.upkeep.food * 10) / 10, gold: Math.round(s.upkeep.gold * 10) / 10 },
    buildings: s.buildings,
  };
}

export const baseUnitKeys = Object.keys(BASE_UNITS);
