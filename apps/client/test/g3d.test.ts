// 3D rejim jang mantiqi: zarba, to'sish, himoya sinishi, AI va buyruqlar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Arena, WINDUP, STRIKE } from '../src/g3d/combat.js';
import { command, updateAI } from '../src/g3d/ai.js';
import { CIV_LIST, CIVS } from '../src/g3d/civs.js';

const run = (ar: Arena, sec: number, each?: () => void) => { for (let t = 0; t < sec; t += 1 / 60) { each?.(); ar.step(1 / 60); } };

test('6 ta sivilizatsiya, har birida tavsif va ustunlik', () => {
  assert.equal(CIV_LIST.length, 6);
  for (const k of CIV_LIST) { assert.ok(CIVS[k].desc.length > 40); assert.ok(CIVS[k].advantages.length >= 2); }
});

test('zarba oldidagi dushmanga tegadi, orqadagiga tegmaydi', () => {
  const ar = new Arena('t1');
  const a = ar.spawn(0, 'timurid', 0, 0, { player: true }); a.yaw = 0;
  const front = ar.spawn(1, 'english', 0, 1.2); const back = ar.spawn(1, 'english', 0, -1.2);
  assert.ok(ar.attack(a));
  run(ar, WINDUP + STRIKE + 0.05);
  assert.ok(front.hp < front.maxHp, 'oldingiga tegdi');
  assert.equal(back.hp, back.maxHp, 'orqadagiga tegmadi');
});

test("qalqon old tomondan to'sadi, chidamlilik kamayadi; orqadan to'smaydi", () => {
  const ar = new Arena('t2');
  const a = ar.spawn(0, 'ottoman', 0, 0); a.yaw = 0;
  const b = ar.spawn(1, 'russian', 0, 1.2); b.yaw = Math.PI; // a ga qaragan
  ar.block(b, true); const st = b.stam;
  ar.attack(a); run(ar, WINDUP_NPC_SAFE());
  assert.equal(b.hp, b.maxHp); assert.ok(b.stam < st);
  // orqa o'girilgan
  const c = ar.spawn(1, 'russian', 0, -1.2); c.yaw = Math.PI; ar.block(c, true); a.yaw = Math.PI; a.state = 'idle';
  ar.attack(a); run(ar, WINDUP_NPC_SAFE());
  assert.ok(c.hp < c.maxHp, "orqadan to'sib bo'lmaydi");
});
function WINDUP_NPC_SAFE() { return 0.46 + STRIKE + 0.1; }

test("chidamlilik tugasa himoya sinadi", () => {
  const ar = new Arena('t3');
  const a = ar.spawn(0, 'mughal', 0, 0); a.yaw = 0;
  const b = ar.spawn(1, 'chinese', 0, 1.2); b.yaw = Math.PI; b.stam = 5;
  ar.block(b, true); ar.attack(a); run(ar, WINDUP_NPC_SAFE());
  assert.equal(b.state, 'stagger');
  assert.ok(b.hp < b.maxHp);
});

test("AI: ikki guruh jang qiladi va biri yutadi; o'liklar harakatlanmaydi", () => {
  const ar = new Arena('t4');
  const p = ar.spawn(0, 'timurid', 0, 10, { player: true });
  for (let i = 0; i < 6; i++) { const f = ar.spawn(0, 'timurid', i - 3, 12, { skill: 0.4 }); f.cmd = 'charge'; f.slot = i; }
  for (let i = 0; i < 4; i++) ar.spawn(1, 'english', i - 2, -10, { skill: 0.2 });
  p.hp = 1e6; p.maxHp = 1e6;
  for (let t = 0; t < 90 && ar.alive(1).length > 0; t += 1 / 30) { for (const f of ar.fighters) updateAI(ar, f, 1 / 30, p); ar.step(1 / 30); }
  assert.equal(ar.alive(1).length, 0, "ittifoqchilar dushmanni yengdi");
  const dead = ar.fighters.filter(f => f.state === 'dead');
  const pos = dead.map(f => [f.x, f.z]); run(ar, 1); dead.forEach((f, i) => assert.deepEqual([f.x, f.z], pos[i]));
});

test("buyruqlar: 'turing' joyida qoladi, 'ergashing' o'yinchi orqasidan yuradi", () => {
  const ar = new Arena('t5');
  const p = ar.spawn(0, 'russian', 0, 0, { player: true }); p.yaw = 0;
  const f = ar.spawn(0, 'russian', 0, -2); f.cmd = 'follow';
  command(ar, 0, 'hold', p);
  p.x = 20;
  for (let t = 0; t < 3; t += 1 / 30) { updateAI(ar, f, 1 / 30, p); ar.step(1 / 30); }
  assert.ok(Math.hypot(f.x - 0, f.z + 2) < 1, "turdi");
  command(ar, 0, 'follow', p);
  for (let t = 0; t < 8; t += 1 / 30) { updateAI(ar, f, 1 / 30, p); ar.step(1 / 30); }
  assert.ok(Math.hypot(f.x - p.x, f.z - p.z) < 5, "ergashdi");
});
