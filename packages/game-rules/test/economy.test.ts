// packages/game-rules/test/economy.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CULTURES, ledgerTotal } from '../src/cultures.js';
import { buildTimeSec, cityTier, costAt, happiness, productivity, simulateCity, storageCap, type CityEconomyState } from '../src/economy.js';
import type { Culture } from '../src/types.js';

test('E-01 narx o\'sishi: ferma L10 yog\'och = round(60*1.6^9) = 4123', () => assert.equal(costAt('ferma', 10).wood, 4123));
test('E-02 qurilish vaqti: saroy L5 temuriy = round(600*1.55^4*0.9) = 3117 s', () => assert.equal(buildTimeSec('saroy', 5, 4, 'temuriy'), 3117));
test('E-03 ombor sig\'imi: L0 = 1000, L1 = 3000, oltin x2', () => {
  assert.equal(storageCap(0, 'wood'), 1000);
  assert.equal(storageCap(1, 'wood'), 3000);
  assert.equal(storageCap(1, 'gold'), 6000);
});
test('E-04 baxt: soliq 10%, to\'q, amenity 0 -> 70 ; soliq 40% och -> 0', () => {
  assert.equal(happiness(10, true, 0, 0), 70);
  assert.equal(happiness(40, false, 0, 0), 0);
});
test('E-05 mahsuldorlik 50 da uzluksiz', () => assert.equal(productivity(49.9999).toFixed(3), productivity(50).toFixed(3)));
test('E-06 shahar darajasi: saroy 9 lekin aholi 3000 -> rivojlangan_shahar', () => assert.equal(cityTier(9, 3000), 'rivojlangan_shahar'));

const city = (o: Partial<CityEconomyState> = {}): CityEconomyState => ({
  culture: 'temuriy', population: 300, taxPct: 10,
  stock: { gold: 500, food: 500, wood: 500, stone: 500, iron: 100, horses: 0 },
  buildings: [{ key: 'saroy', level: 1 }, { key: 'ferma', level: 2 }, { key: 'yogoch', level: 1 }, { key: 'mahalla', level: 1 }],
  armyFoodPerHour: 0, armyGoldPerHour: 0, warWeariness: 0, ...o,
});

test('E-07 oflayn 8 soat: resurslar ombor sig\'imidan oshmaydi, aholi sig\'imdan oshmaydi', () => {
  const { state } = simulateCity(city(), 0, 8 * 3_600_000);
  assert.ok(state.stock.wood <= 1000 && state.population <= 600 && state.population >= 300);
});
test('E-08 katta qo\'shin ovqatni tugatadi -> starvation_started hodisasi', () => {
  const { state, events } = simulateCity(city({ armyFoodPerHour: 400 }), 0, 6 * 3_600_000);
  assert.equal(state.stock.food, 0);
  assert.ok(events.some(e => e.type === 'starvation_started'));
});
test('E-09 bitta uzun simulyatsiya = bo\'laklangan simulyatsiya (lazy simulation izchilligi)', () => {
  const whole = simulateCity(city(), 0, 4 * 3_600_000).state;
  const half = simulateCity(city(), 0, 2 * 3_600_000).state;
  const rest = simulateCity(half, 2 * 3_600_000, 4 * 3_600_000).state;
  assert.ok(Math.abs(whole.stock.wood - rest.stock.wood) <= 2);
  assert.ok(Math.abs(whole.population - rest.population) <= 2);
});
test('E-10 balans byudjeti: har bir millat sof +30 ball', () => {
  for (const c of Object.keys(CULTURES) as Culture[]) assert.equal(ledgerTotal(c), 30, c);
});
test('E-11 bozor narxi: Q=0 -> p0, Q=+50k -> p0*e, katta talab -> 4*p0 chegarasi', async () => {
  const { marketPrice } = await import('../src/economy.js');
  assert.equal(marketPrice(1.5, 0), 1.5);
  assert.ok(Math.abs(marketPrice(1, 50_000) - Math.E) < 1e-9);
  assert.equal(marketPrice(1, 1_000_000), 4);
  assert.equal(marketPrice(1, -1_000_000), 0.25);
});
