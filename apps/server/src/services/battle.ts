// apps/server/src/services/battle.ts
// Qo'shin manzilga yetganda: station / return / attack. Hujumda jang serverda bir marta hisoblanadi (D-12).
// Kirish: army_arrival hodisasi. Chiqish: battles + battle_records, yo'qotishlar, o'lja, sadoqat tekshiruvi.

import { randomUUID } from 'node:crypto';
import {
  resolveBattle, siegeDamagePerHour, terrainAt, veterancyFromXp, weatherAt, xpGain,
  type BattleArmy, type BattleInput, type Culture, type Resources, unitDef,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { dispatch, settleAtHome } from './army.js';
import { syncCity } from './city.js';
import { deleteFieldArmy, notify, pushRt, realDelay, setUnits, take, totalUnits, unitsOf, type Game } from './common.js';
import { activeTreaty } from './diplomacy.js';
import { afterBattle, armyLoyalty } from './service.js';

interface ArmyFull {
  id: string; owner_kingdom_id: string; serving_kingdom_id: string | null; home_city_id: string; culture: Culture; kind: string;
  status: string; mission: string; commander_id: string | null; x: number; y: number; to_x: number | null; to_y: number | null;
  target_city_id: string | null; station_city_id: string | null; xp: number; loot: Record<string, number>;
}

export async function handleArrival(t: Tx, g: Game, p: { armyId: string }) {
  const a = await one<ArmyFull & Record<string, unknown>>(t, 'SELECT * FROM armies WHERE id = $1 FOR UPDATE', [p.armyId]);
  if (!a || a.status === 'home' || a.status === 'stationed') return;
  await t.query('UPDATE armies SET x = COALESCE(to_x, x), y = COALESCE(to_y, y), arrive_at = NULL WHERE id = $1', [a.id]);
  a.x = a.to_x ?? a.x; a.y = a.to_y ?? a.y;
  if (a.mission === 'return') return settleAtHome(t, a.id);
  if (a.mission === 'station') {
    await t.query("UPDATE armies SET status = 'stationed', mission = 'none' WHERE id = $1", [a.id]);
    if (a.serving_kingdom_id) await notify(t, a.serving_kingdom_id, 'xizmat', 'Xizmatdagi qo\'shin poytaxtingizga yetib keldi');
    await pushRt(t, null, 'world_changed');
    return;
  }
  return fight(t, g, a);
}

async function sendBack(t: Tx, g: Game, a: ArmyFull) {
  const units = await unitsOf(t, a.id);
  if (totalUnits(units) === 0) { await deleteFieldArmy(t, a.id); return; }
  const dest = a.serving_kingdom_id && a.station_city_id ? a.station_city_id : a.home_city_id;
  const c = await one<{ x: number; y: number }>(t, 'SELECT x, y FROM cities WHERE id = $1', [dest]);
  await dispatch(t, g, a.id, { x: c!.x, y: c!.y, cityId: null }, 'return');
}

async function toBattleArmy(t: Tx, armyId: string): Promise<BattleArmy & { meta: ArmyFull }> {
  const a = (await one<ArmyFull & Record<string, unknown>>(t, 'SELECT * FROM armies WHERE id = $1', [armyId]))!;
  const units = await unitsOf(t, armyId);
  const cmd = a.commander_id ? await one<{ skill: number }>(t, 'SELECT skill FROM commanders WHERE id = $1 AND alive', [a.commander_id]) : undefined;
  const feeder = a.serving_kingdom_id
    ? (await one<{ capital_city_id: string }>(t, 'SELECT capital_city_id FROM kingdoms WHERE id = $1', [a.serving_kingdom_id]))!.capital_city_id
    : a.home_city_id;
  const food = (await one<{ food: number }>(t, 'SELECT food FROM resources WHERE city_id = $1', [feeder]))?.food ?? 0;
  const smithy = (await one<{ level: number }>(t, "SELECT level FROM buildings WHERE city_id = $1 AND key = 'temirchilik'", [a.home_city_id]))?.level ?? 0;
  const v = veterancyFromXp(a.xp);
  return {
    armyId, culture: a.culture, generalSkill: cmd?.skill ?? 0, loyalty: await armyLoyalty(t, armyId), fed: food > 0, smithyLevel: smithy,
    stacks: Object.entries(units).map(([unitKey, count]) => ({ unitKey, count, veterancy: v })), meta: a,
  };
}

async function fight(t: Tx, g: Game, a: ArmyFull) {
  const attackerK = a.serving_kingdom_id ?? a.owner_kingdom_id;
  const target = a.target_city_id ? await one<{ id: string; kingdom_id: string; name: string; x: number; y: number }>(t,
    'SELECT id, kingdom_id, name, x, y FROM cities WHERE id = $1', [a.target_city_id]) : undefined;
  if (!target || target.kingdom_id === attackerK) return sendBack(t, g, a);
  const defK = await one<{ shield_until: Date | null; name: string }>(t, 'SELECT shield_until, name FROM kingdoms WHERE id = $1', [target.kingdom_id]);
  if (await activeTreaty(t, attackerK, target.kingdom_id, 'tinchlik') || (defK?.shield_until && defK.shield_until.getTime() > Date.now())) {
    await notify(t, attackerK, 'jang', `${target.name}: hujum bekor`, 'Yo\'lda tinchlik tuzildi yoki shahar himoya qalqoni ostida');
    return sendBack(t, g, a);
  }

  const now = Date.now();
  const s = await syncCity(t, g, target.id, now);
  const defenderIds = (await many<{ id: string }>(t, `SELECT id FROM armies WHERE (home_city_id = $1 AND kind = 'garrison')
      OR (station_city_id = $1 AND status = 'stationed') FOR UPDATE`, [target.id])).map(r => r.id);
  const attackers = [await toBattleArmy(t, a.id)];
  const defenders = await Promise.all(defenderIds.map(id => toBattleArmy(t, id)));

  const terrain = terrainAt(target.x, target.y);
  const weather = weatherAt(target.x, target.y, now);
  const wallLevel = s.level('devor');
  const wallBefore = s.city.wall_hp;
  const siege = siegeDamagePerHour(attackers[0]!.stacks, a.culture, weather);
  const wallAfter = Math.max(0, Math.round(wallBefore - siege));
  const battleId = randomUUID();
  const strip = (x: BattleArmy & { meta: ArmyFull }): BattleArmy => ({ armyId: x.armyId, culture: x.culture, stacks: x.stacks, generalSkill: x.generalSkill, loyalty: x.loyalty, fed: x.fed, smithyLevel: x.smithyLevel });
  const input: BattleInput = {
    battleId, terrain, weather,
    attackers: attackers.map(strip), defenders: defenders.map(strip),
    fortification: wallLevel > 0 ? { wallLevel, wallHp: wallAfter, towerLevel: s.level('minora') } : undefined,
  };
  const r = resolveBattle(input);
  const attackerWon = r.winner === 'attacker';

  // yo'qotishlar
  const byArmy = new Map<string, Record<string, number>>();
  for (const l of r.losses) {
    const m = byArmy.get(l.armyId) ?? {};
    m[l.unitKey] = l.before - l.lost;
    byArmy.set(l.armyId, m);
  }
  for (const [armyId, left] of byArmy) await setUnits(t, armyId, left);

  // XP va generallar
  for (const x of [...attackers, ...defenders]) {
    const won = attackers.includes(x) ? attackerWon : !attackerWon;
    await t.query('UPDATE armies SET xp = xp + $2 WHERE id = $1', [x.armyId, xpGain(won)]);
    if (x.meta.commander_id) {
      await t.query(won
        ? 'UPDATE commanders SET skill = LEAST(30, skill + 1), prestige = LEAST(100, prestige + 5), wins = wins + 1 WHERE id = $1'
        : 'UPDATE commanders SET prestige = GREATEST(0, prestige - 8), losses = losses + 1 WHERE id = $1', [x.meta.commander_id]);
    }
  }

  // o'lja
  let loot: Partial<Resources> = {};
  if (attackerWon) {
    const survivors = byArmy.get(a.id) ?? {};
    const carry = Object.entries(survivors).reduce((sum, [k, n]) => sum + n * unitDef(k).carry, 0);
    const want: Partial<Resources> = {};
    let total = 0;
    for (const [k, v] of Object.entries(s.resources) as [keyof Resources, number][]) { want[k] = v * 0.2; total += v * 0.2; }
    const scale = total > carry ? carry / total : 1;
    for (const k of Object.keys(want) as (keyof Resources)[]) want[k] = Math.floor((want[k] ?? 0) * scale);
    loot = await take(t, target.id, want);
    const merged = { ...a.loot };
    for (const [k, v] of Object.entries(loot)) merged[k] = (merged[k] ?? 0) + (v ?? 0);
    await t.query('UPDATE armies SET loot = $2::jsonb WHERE id = $1', [a.id, JSON.stringify(merged)]);
    await t.query('UPDATE kingdoms SET shield_until = $2 WHERE id = $1', [target.kingdom_id, new Date(now + realDelay(g, 48 * 3_600_000))]);
  }
  await t.query('UPDATE cities SET wall_hp = $2, war_weariness = LEAST(30, war_weariness + 5) WHERE id = $1', [target.id, wallAfter]);
  await t.query('UPDATE cities SET war_weariness = LEAST(30, war_weariness + 5) WHERE id = $1', [a.home_city_id]);

  const ratio = Number.isFinite(r.ratio) ? Math.min(r.ratio, 999) : 999;
  await t.query(`INSERT INTO battles (id, x, y, terrain, weather, attacker_kingdom_id, defender_kingdom_id, target_city_id, winner, ratio, luck,
      attack_power, defense_power, wall_hp_before, wall_hp_after, loot, input)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb)`,
    [battleId, target.x, target.y, terrain, weather, attackerK, target.kingdom_id, target.id, r.winner, ratio, r.luck,
      r.attackPower, r.defensePower, wallBefore, wallAfter, JSON.stringify(loot), JSON.stringify(input)]);
  const sideOf = new Map([...attackers.map(x => [x.armyId, 'attacker'] as const), ...defenders.map(x => [x.armyId, 'defender'] as const)]);
  const ownerOf = new Map([...attackers, ...defenders].map(x => [x.armyId, x.meta.owner_kingdom_id]));
  for (const l of r.losses) {
    await t.query('INSERT INTO battle_records (battle_id, army_id, kingdom_id, side, unit_key, before, lost) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [battleId, l.armyId, ownerOf.get(l.armyId), sideOf.get(l.armyId), l.unitKey, l.before, l.lost]);
  }

  // sadoqat (faqat xizmatdagi qo'shinlar uchun natija bor)
  for (const x of [...attackers, ...defenders]) {
    const won = attackers.includes(x) ? attackerWon : !attackerWon;
    await afterBattle(t, g, x.armyId, won, battleId);
  }
  // bo'shab qolgan dala qo'shinlari
  for (const id of defenderIds) {
    const left = await unitsOf(t, id);
    if (totalUnits(left) === 0) await deleteFieldArmy(t, id);
  }

  const lostA = r.losses.filter(l => sideOf.get(l.armyId) === 'attacker').reduce((x, l) => x + l.lost, 0);
  const lostD = r.losses.filter(l => sideOf.get(l.armyId) === 'defender').reduce((x, l) => x + l.lost, 0);
  const summary = `Kuch nisbati ${ratio.toFixed(2)}, ob-havo: ${weather}, terren: ${terrain}. Hujumchi ${lostA}, himoyachi ${lostD} askar yo'qotdi.`;
  await notify(t, attackerK, 'jang', attackerWon ? `G'alaba: ${target.name}` : `Mag'lubiyat: ${target.name}`, summary, { battleId });
  if (a.serving_kingdom_id && a.owner_kingdom_id !== attackerK) await notify(t, a.owner_kingdom_id, 'jang', `Xizmatdagi qo'shiningiz jang qildi: ${attackerWon ? 'g\'alaba' : 'mag\'lubiyat'}`, summary, { battleId });
  await notify(t, target.kingdom_id, 'jang', attackerWon ? `${target.name} talandi` : `${target.name} himoya qilindi`, summary, { battleId });

  const fresh = (await one<ArmyFull & Record<string, unknown>>(t, 'SELECT * FROM armies WHERE id = $1', [a.id]));
  if (fresh) await sendBack(t, g, fresh);
  await pushRt(t, null, 'world_changed');
  return { battleId, winner: r.winner };
}
