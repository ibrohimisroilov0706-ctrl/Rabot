// packages/game-rules/test/intrigue.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAME_YEAR_MS, assassinationEligibility, assassinationSuccess, exposureChance, resolveSuccession, targetSecurity } from '../src/intrigue.js';

const H = 3_600_000;

test('A-01 o\'z saroyidagi qirol (mehmon kutayotgan bo\'lsa ham) nishon emas', () => {
  assert.equal(assassinationEligibility('k2', { kingdomId: 'k1', ownPalaceCityId: 'c1', currentCityId: 'c1', alive: true }, null, 0), 'not_guest');
});
test('A-02 boshqa saroydagi mehmon qirol nishon bo\'la oladi', () => {
  assert.equal(assassinationEligibility('k3', { kingdomId: 'k1', ownPalaceCityId: 'c1', currentCityId: 'c2', alive: true }, null, 0), null);
});
test('A-03 24 soatlik kutish', () => {
  const t = { kingdomId: 'k1', ownPalaceCityId: 'c1', currentCityId: 'c2', alive: true };
  assert.equal(assassinationEligibility('k3', t, 0, 23 * H), 'cooldown');
  assert.equal(assassinationEligibility('k3', t, 0, 24 * H), null);
});
test('A-04 ehtimollar: a=60, s=33, z=0.5 -> P=0.435, fosh=0.365', () => {
  const s = targetSecurity(5, 2, false, 0);
  assert.equal(s, 33);
  assert.ok(Math.abs(assassinationSuccess(60, s, 0.5) - 0.435) < 1e-9);
  assert.ok(Math.abs(exposureChance(60, s, 0.5) - 0.365) < 1e-9);
});
test('A-05 ehtimol chegaralari: 3%..55%', () => {
  assert.equal(assassinationSuccess(0, 100, 0), 0.03);
  assert.equal(assassinationSuccess(100, 0, 1), 0.55);
});

const heir = (id: string, ageY: number, rank: number, now: number, alive = true) => ({ id, birthMs: now - ageY * GAME_YEAR_MS, orderRank: rank, alive, legitimacy: 50 });

test('V-01 katta merosxo\'r toj kiyadi', () => {
  const now = 100 * GAME_YEAR_MS;
  assert.deepEqual(resolveSuccession([heir('h1', 20, 1, now)], now, 50), { kind: 'crowned', heirId: 'h1' });
});
test('V-02 birinchi merosxo\'r 12 yosh -> regentlik 4 kun, ikkinchi katta merosxo\'r taxtni olmaydi', () => {
  const now = 100 * GAME_YEAR_MS;
  const r = resolveSuccession([heir('h1', 12, 1, now), heir('h2', 25, 2, now)], now, 50);
  assert.equal(r.kind, 'regency');
  if (r.kind === 'regency') assert.equal(r.regencyEndsMs - now, 4 * GAME_YEAR_MS);
});
test('V-03 merosxo\'r yo\'q: zodagon sadoqati 35 -> fuqarolar urushi, 60 -> tinch inqiroz', () => {
  assert.deepEqual(resolveSuccession([heir('h1', 30, 1, 0, false)], 0, 35), { kind: 'crisis', civilWar: true });
  assert.deepEqual(resolveSuccession([], 0, 60), { kind: 'crisis', civilWar: false });
});
