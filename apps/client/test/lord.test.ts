// Lord rejimi mantiqi: dunyo yaratish, simulyatsiya barqarorligi, jang determinizmi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle, runToEnd, type BattleSetup } from '../src/lord/battle.js';
import { TROOPS, troop } from '../src/lord/data.js';
import { applyPlayerBattle, count, newWorld, player, recruitVillage, step, upgrade, addTroops } from '../src/lord/world.js';

test("qo'shin daraxtlari to'g'ri bog'langan", () => {
  for (const t of Object.values(TROOPS)) for (const u of t.up) { assert.ok(TROOPS[u], `${t.id} -> ${u}`); assert.ok(troop(u).tier > t.tier); }
  assert.ok(Object.keys(TROOPS).length >= 40);
});

test('dunyo: 5 fraksiya, 90 aholi punkti, lordlar va qaroqchilar', () => {
  const w = newWorld('Sinov', 'temuriy', 'seed1');
  assert.equal(w.sets.filter(s => s.kind === 'town').length, 15);
  assert.equal(w.sets.filter(s => s.kind === 'castle').length, 15);
  assert.ok(w.sets.filter(s => s.kind === 'village').length >= 50);
  assert.equal(w.parties.filter(p => p.kind === 'lord').length, 25);
  assert.ok(w.parties.some(p => p.kind === 'bandit'));
  assert.equal(count(player(w).troops), 16);
});

test("simulyatsiya 60 kun davomida buzilmaydi va urushlar bo'ladi", () => {
  const w = newWorld('Sinov', 'rus', 'seed2');
  player(w).goal = null; w.player.food = 10000; player(w).gold = 100000;
  let ev = 0;
  for (let g = 0; w.t < 60 * 24 && g < 100000; g++) { ev += step(w, 1).length; }
  assert.ok(w.t > 60 * 24);
  for (const p of w.parties) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); for (const s of p.troops) assert.ok(s.n >= 0 && s.w >= 0 && s.w <= s.n); }
  assert.ok(w.log.length > 5, 'yangiliklar bor');
  assert.ok(ev >= 0);
});

test("qishloqdan yollash va oshirish", () => {
  const w = newWorld('Sinov', 'ingliz', 'seed3');
  const v = w.sets.find(s => s.kind === 'village' && s.cu === 'ingliz')!;
  const n = recruitVillage(w, v, 3);
  assert.equal(n, 3);
  const st = player(w).troops.find(s => s.id === 'ingliz_t1')!;
  st.xp = 1000;
  assert.equal(upgrade(w, 'ingliz_t1', 'ingliz_arc2', 2), 2);
  assert.throws(() => upgrade(w, 'ingliz_t1', 'ingliz_cav3', 1));
});

const setup = (seed: string, siege = false): BattleSetup => ({
  seed, terrain: 'tekislik', weather: 'ochiq', siege, size: 40,
  sides: [
    { name: 'A', cu: 'temuriy', ai: true, hero: { name: 'H', level: 3 }, stacks: [{ id: 'temuriy_inf2', n: 20 }, { id: 'temuriy_arc2', n: 15 }, { id: 'temuriy_cav3', n: 10 }] },
    { name: 'B', cu: 'rus', ai: true, stacks: [{ id: 'rus_t1', n: 25 }, { id: 'rus_inf3', n: 12 }, { id: 'rus_arc3', n: 10 }] },
  ],
});

test('jang: bir xil seed -> bir xil natija (duel uchun)', () => {
  const a = runToEnd(new Battle(setup('x1')));
  const b = runToEnd(new Battle(setup('x1')));
  assert.deepEqual(a, b);
  assert.ok(a.time > 5 && a.time < 900);
  const lostTotal = Object.values(a.lost[0]).reduce((x, y) => x + y, 0) + Object.values(a.lost[1]).reduce((x, y) => x + y, 0);
  assert.ok(lostTotal > 10);
});

test("jang: kuchli qo'shin odatda yutadi", () => {
  let wins = 0;
  for (let i = 0; i < 6; i++) {
    const s = setup(`k${i}`); s.sides[1].stacks = [{ id: 'rus_t1', n: 20 }];
    if (runToEnd(new Battle(s)).winner === 0) wins++;
  }
  assert.ok(wins >= 5, `g'alabalar: ${wins}`);
});

test("qamal: hujumchilar devorga chiqadi va jang tugaydi", () => {
  const s = setup('siege1', true);
  s.sides[0].stacks = [{ id: 'temuriy_inf3', n: 45 }, { id: 'temuriy_arc3', n: 20 }];
  s.sides[1].stacks = [{ id: 'rus_t1', n: 15 }, { id: 'rus_arc2', n: 8 }];
  const b = new Battle(s); let climbed = false;
  while (!b.result) { b.step(0.1); if (b.units.some(u => u.side === 0 && u.onWall)) climbed = true; }
  assert.ok(climbed, 'kimdir devorga chiqdi');
  assert.equal(b.result.winner, 0);
});

test("jang natijasi qo'llanadi: asir, tajriba, obro'", () => {
  const w = newWorld('Sinov', 'mogul', 'seed4');
  const bandit = w.parties.find(p => p.kind === 'bandit')!;
  const before = w.player.renown;
  const lost1: Record<string, number> = {}; for (const s of bandit.troops) lost1[s.id] = s.n;
  addTroops(player(w).troops, 'mogul_cav3', 5);
  applyPlayerBattle(w, { party: bandit }, { win: true, lost0: { mogul_t1: 2 }, lost1, heroKills: 3, retreated: false });
  assert.ok(w.player.renown > before);
  assert.ok(!w.parties.includes(bandit));
  assert.ok(player(w).troops.some(s => s.xp > 0));
});
