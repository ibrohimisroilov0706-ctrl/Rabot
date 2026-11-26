// packages/game-rules/test/loyalty.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  economicDailyDesertShare, evaluateServiceLoyalty, loyaltyScore, warProbability, type LoyaltyInputs, type ServiceRecord,
} from '../src/loyalty.js';

const neutral: LoyaltyInputs = { payRatio: 1, foodRatio: 1, generalPrestige: 50, relation: 0, sameCulture: false, generosityActive: false, eliteBonus: 0 };
const rec = (o: Partial<ServiceRecord>): ServiceRecord => ({
  serviceId: 'svc-1', armyCulture: 'temuriy', hostCulture: 'usmonli', wins: 0, losses: 0,
  soldiers: { otliq: 1000, kamonchi: 301 }, loyalty: 50, ...o,
});

test('S-01 neytral sharoitda S = 50', () => assert.equal(loyaltyScore(neutral), 50));
test('S-02 maosh umuman to\'lanmagan: S = 20', () => assert.equal(loyaltyScore({ ...neutral, payRatio: 0 }), 20));
test('S-03 ochlik + maoshsizlik: S = 0 (pastki chegara)', () => assert.equal(loyaltyScore({ ...neutral, payRatio: 0, foodRatio: 0 }), 0));
test('S-04 eng yaxshi holat 100 dan oshmaydi', () =>
  assert.equal(loyaltyScore({ payRatio: 2, foodRatio: 1, generalPrestige: 100, relation: 100, sameCulture: true, generosityActive: true, eliteBonus: 10 }), 100));
test('S-05 maosh 150%, general 80, munosabat +40: S = 50+10+6+6 = 72', () =>
  assert.equal(loyaltyScore({ ...neutral, payRatio: 1.5, generalPrestige: 80, relation: 40 }), 72));

test('L-01 bir xil millat: 0 g\'alaba / 5 mag\'lubiyat -> hech qanday milliy hodisa', () => {
  const o = evaluateServiceLoyalty(rec({ armyCulture: 'usmonli', wins: 0, losses: 5 }), 'b1');
  assert.deepEqual(o.event, { type: 'none', reason: 'same_culture' });
  assert.equal(o.next.losses, 5);
});
test('L-02 bir xil millat: 9 g\'alaba / 0 mag\'lubiyat -> mustaqillik hodisasi yo\'q', () => {
  assert.equal(evaluateServiceLoyalty(rec({ armyCulture: 'usmonli', wins: 9 }), 'b1').event.type, 'none');
});
test('L-03 boshqa millat, N=2 < N_MIN -> tekshiruv yo\'q', () => {
  assert.deepEqual(evaluateServiceLoyalty(rec({ wins: 0, losses: 2 }), 'b1').event, { type: 'none', reason: 'below_min' });
});
test('L-04 boshqa millat, 1G/2M -> aniq 50% tarqaladi (pastga yaxlitlab), hisob nolga tushadi', () => {
  const o = evaluateServiceLoyalty(rec({ wins: 1, losses: 2 }), 'b1');
  assert.equal(o.event.type, 'desertion');
  if (o.event.type !== 'desertion') return;
  assert.equal(o.event.rule, 'R2');
  assert.deepEqual(o.event.deserted, { otliq: 500, kamonchi: 150 });
  assert.deepEqual(o.next.soldiers, { otliq: 500, kamonchi: 151 });
  assert.equal(o.next.wins + o.next.losses, 0);
});
test('L-05 50% tarqalish S dan qat\'i nazar o\'zgarmaydi (S=100 bo\'lsa ham)', () => {
  const o = evaluateServiceLoyalty(rec({ wins: 0, losses: 3, loyalty: 100 }), 'b1');
  assert.equal(o.event.type === 'desertion' && o.event.share, 0.5);
});
test('L-06 boshqa millat, 3G/1M -> mustaqillik hodisasi, p_war S ga bog\'liq', () => {
  const o = evaluateServiceLoyalty(rec({ wins: 3, losses: 1, loyalty: 80 }), 'b7');
  assert.equal(o.event.type, 'independence');
  if (o.event.type !== 'independence') return;
  assert.equal(o.event.pWar, 0.2);
  assert.equal(o.event.outcome, o.event.roll < 0.2 ? 'war' : 'peaceful');
});
test('L-07 mustaqillik natijasi deterministik: bir xil kalit -> bir xil roll', () => {
  const a = evaluateServiceLoyalty(rec({ wins: 4, losses: 1 }), 'battle-42');
  const b = evaluateServiceLoyalty(rec({ wins: 4, losses: 1 }), 'battle-42');
  assert.deepEqual(a.event, b.event);
});
test('L-08 p_war chegaralari: S=0 -> 0.9, S=20 -> 0.8, S=50 -> 0.5, S=100 -> 0.1', () => {
  assert.deepEqual([0, 20, 50, 100].map(warProbability), [0.9, 0.8, 0.5, 0.1]);
});
test('L-09 teng 2G/2M: S=65 -> tarqalish yo\'q, hisob saqlanadi', () => {
  const o = evaluateServiceLoyalty(rec({ wins: 2, losses: 2, loyalty: 65 }), 'b1');
  assert.deepEqual(o.event, { type: 'none', reason: 'tie_passed' });
  assert.equal(o.next.wins, 2);
});
test('L-10 teng 2G/2M: S=50 -> 10%, S=30 -> 25%', () => {
  const a = evaluateServiceLoyalty(rec({ wins: 2, losses: 2, loyalty: 50 }), 'b1');
  const b = evaluateServiceLoyalty(rec({ wins: 2, losses: 2, loyalty: 30 }), 'b1');
  assert.equal(a.event.type === 'desertion' && a.event.share, 0.1);
  assert.equal(b.event.type === 'desertion' && b.event.deserted['otliq'], 250);
});
test('L-11 iqtisodiy tarqalish: S=20 -> kuniga 8%, S=100 -> 0%', () => {
  assert.ok(Math.abs(economicDailyDesertShare(20) - 0.08) < 1e-12);
  assert.equal(economicDailyDesertShare(100), 0);
});
