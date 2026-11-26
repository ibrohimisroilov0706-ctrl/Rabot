// packages/game-rules/test/battle.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lossFractions, morale, resolveBattle, siegeDamagePerHour, terrainAtk, wallMaxHp, type BattleArmy } from '../src/battle.js';

const army = (id: string, culture: BattleArmy['culture'], stacks: [string, number][], o: Partial<BattleArmy> = {}): BattleArmy => ({
  armyId: id, culture, stacks: stacks.map(([unitKey, count]) => ({ unitKey, count, veterancy: 0 })), generalSkill: 0, loyalty: 50, fed: true, ...o,
});

test('B-01 yo\'qotish ulushlari: r=1 -> 50/50, r=2 -> 17.7%/75%, r>=10 -> mag\'lub 100%', () => {
  assert.deepEqual(lossFractions(1), { winner: 0.5, loser: 0.5 });
  const r2 = lossFractions(2);
  assert.ok(Math.abs(r2.winner - 0.1768) < 1e-3 && r2.loser === 0.75);
  assert.equal(lossFractions(10).loser, 1);
});
test('B-02 morale: S=50 to\'q -> 1.0; S=50 och -> 0.7', () => {
  assert.equal(morale(50, true), 1);
  assert.ok(Math.abs(morale(50, false) - 0.7) < 1e-9);
});
test('B-03 jang deterministik: bir xil battleId -> bir xil natija', () => {
  const inp = { battleId: 'x1', terrain: 'tekislik' as const, weather: 'ochiq' as const,
    attackers: [army('a', 'mogul', [['otliq', 300]])], defenders: [army('d', 'rus', [['nayzachi', 300]])] };
  assert.deepEqual(resolveBattle(inp), resolveBattle(inp));
});
test('B-04 nayzachi otliqqa qarshi: 300 nayzachi ochiq maydonda 300 otliqni to\'xtatadi', () => {
  const r = resolveBattle({ battleId: 'x2', terrain: 'tekislik', weather: 'ochiq',
    attackers: [army('a', 'ingliz', [['otliq', 300]])], defenders: [army('d', 'ingliz', [['nayzachi', 300]])] });
  // AP = 300*16*0.9(ingliz otliq)*1.1(tekislik) = 4752 ; DP = 300*14 = 4200 -> nisbat ~1.13*luck
  assert.ok(r.ratio > 1 && r.ratio < 1.25);
});
test('B-05 devor himoyasi: devor 5-daraja himoyachi kuchini x1.40 qiladi', () => {
  const base = { battleId: 'x3', terrain: 'tekislik' as const, weather: 'ochiq' as const,
    attackers: [army('a', 'usmonli', [['piyoda', 500]])], defenders: [army('d', 'temuriy', [['piyoda', 300]])] };
  const open = resolveBattle(base);
  const walled = resolveBattle({ ...base, fortification: { wallLevel: 5, wallHp: 100, towerLevel: 0 } });
  assert.ok(Math.abs(walled.defensePower / open.defensePower - 1.4) < 1e-9);
  assert.equal(open.winner, 'attacker');
  assert.equal(walled.winner, 'attacker'); // 500*11 = 5500 vs 300*12*1.4 = 5040
});
test('B-06 moslashgan madaniyat terren jarimasini olmaydi', () => {
  assert.equal(terrainAtk('piyoda', 'chol', 'ingliz'), 0.9);
  assert.equal(terrainAtk('piyoda', 'chol', 'temuriy'), 1);
});
test('B-07 durang himoyachi foydasiga', () => {
  const r = resolveBattle({ battleId: 'tie', terrain: 'tekislik', weather: 'ochiq', attackers: [], defenders: [army('d', 'rus', [['piyoda', 1]])] });
  assert.equal(r.winner, 'defender');
});
test('B-08 devor HP: L1 rus = 1200, L5 mogul = 4556; usmonli to\'plar qamal bonusi +25%', () => {
  assert.equal(wallMaxHp(1, 'rus'), 1200);
  assert.equal(wallMaxHp(5, 'mogul'), 4556);
  assert.equal(siegeDamagePerHour([{ unitKey: 'qamal', count: 10, veterancy: 0 }], 'usmonli', 'ochiq'), 500);
});
test('B-09 temirchilik 10-daraja: hujum va mudofaa x1.10', () => {
  const mk = (sm: number) => resolveBattle({ battleId: 'sm', terrain: 'tekislik', weather: 'ochiq',
    attackers: [army('a', 'rus', [['piyoda', 100]], { smithyLevel: sm })], defenders: [army('d', 'rus', [['piyoda', 100]], { smithyLevel: sm })] });
  assert.ok(Math.abs(mk(10).attackPower / mk(0).attackPower - 1.1) < 1e-9);
  assert.ok(Math.abs(mk(10).defensePower / mk(0).defensePower - 1.1) < 1e-9);
});
