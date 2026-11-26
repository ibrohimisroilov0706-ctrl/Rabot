// apps/server/src/services/construction.ts
// Qurilish: navbatga qo'yish, bekor qilish, tugatish (World Engine hodisasi).
// Qoidalar: GDD 2-bo'lim. Bino darajasi <= saroy darajasi; saroy L uchun ombor >= L-1;
// navbat: 1 ta (saroy 5+ da 2 ta); bino joylari shahar darajasiga bog'liq.

import { BUILDINGS, buildTimeSec, costAt, wallMaxHp, type BuildingKey } from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, notFound } from '../http/router.js';
import { capitalOf, syncCity } from './city.js';
import { credit, notify, pushRt, realDelay, schedule, spend, type Game } from './common.js';

export async function startConstruction(t: Tx, g: Game, kingdomId: string, input: { key?: BuildingKey; buildingId?: string }) {
  const cityId = await capitalOf(t, kingdomId);
  const s = await syncCity(t, g, cityId);
  let key: BuildingKey;
  let buildingId: string;
  let target: number;

  if (input.buildingId) {
    const b = s.buildings.find(x => x.id === input.buildingId);
    if (!b) throw notFound('Bino topilmadi');
    if (b.level === 0) throw conflict('under_construction', 'Bino hali qurilmoqda');
    key = b.key; buildingId = b.id; target = b.level + 1;
  } else {
    if (!input.key || !(input.key in BUILDINGS)) throw bad('bad_building', 'Noma\'lum bino');
    key = input.key;
    if (!BUILDINGS[key].repeatable && s.buildings.some(b => b.key === key)) throw conflict('exists', 'Bu bino allaqachon bor, uni yaxshilang');
    if (s.buildings.length >= s.slots) throw conflict('no_slot', `Bo'sh joy yo'q (${s.slots} ta). Shahar darajasini oshiring`);
    const used = new Set(s.buildings.map(b => b.slot));
    let slot = 0; while (used.has(slot)) slot++;
    target = 1; buildingId = '';
    const ins = await one<{ id: string }>(t, 'INSERT INTO buildings (city_id, key, level, slot) VALUES ($1, $2, 0, $3) RETURNING id', [cityId, key, slot]);
    buildingId = ins!.id;
  }

  if (target > 10) throw conflict('max_level', 'Eng yuqori daraja: 10');
  const palace = s.level('saroy');
  if (key !== 'saroy' && target > palace) throw conflict('palace_low', `Avval saroyni ${target}-darajaga ko'taring`);
  if (key === 'saroy' && target >= 2 && s.level('ombor') < target - 1) throw conflict('storage_low', `Saroy ${target} uchun ombor kamida ${target - 1}-daraja bo'lishi kerak`);

  const active = await many<{ building_id: string }>(t, "SELECT building_id FROM construction_queue WHERE city_id = $1 AND state = 'active'", [cityId]);
  if (active.some(a => a.building_id === buildingId)) throw conflict('busy', 'Bu bino allaqachon qurilmoqda');
  const limit = palace >= 5 ? 2 : 1;
  if (active.length >= limit) throw conflict('queue_full', `Qurilish navbati to'la (${limit} ta)`);

  const cost = costAt(key, target);
  await spend(t, cityId, cost);
  const ms = realDelay(g, buildTimeSec(key, target, Math.max(1, palace), s.culture) * 1000);
  const finishes = new Date(Date.now() + ms);
  const q = await one<{ id: string }>(t, `INSERT INTO construction_queue (city_id, building_id, target_level, cost, finishes_at)
    VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`, [cityId, buildingId, target, JSON.stringify(cost), finishes]);
  await schedule(t, 'construction_complete', finishes, { queueId: q!.id, cityId, kingdomId });
  return { queueId: q!.id, buildingId, key, targetLevel: target, finishesAt: finishes.toISOString(), cost };
}

export async function cancelConstruction(t: Tx, g: Game, kingdomId: string, queueId: string) {
  const cityId = await capitalOf(t, kingdomId);
  await syncCity(t, g, cityId);
  const q = await one<{ id: string; building_id: string; cost: Record<string, number>; target_level: number }>(t,
    "SELECT * FROM construction_queue WHERE id = $1 AND city_id = $2 AND state = 'active' FOR UPDATE", [queueId, cityId]);
  if (!q) throw notFound('Navbat topilmadi');
  await t.query("UPDATE construction_queue SET state = 'cancelled' WHERE id = $1", [queueId]);
  await t.query("UPDATE game_events SET state = 'done', last_error = 'bekor qilindi' WHERE type = 'construction_complete' AND state = 'pending' AND payload->>'queueId' = $1", [queueId]);
  if (q.target_level === 1) await t.query('DELETE FROM buildings WHERE id = $1 AND level = 0', [q.building_id]);
  const refund = Object.fromEntries(Object.entries(q.cost).map(([k, v]) => [k, Math.floor(v * 0.8)]));
  const back = await credit(t, cityId, refund);
  return { refunded: back };
}

/** World Engine hodisasi: construction_complete */
export async function completeConstruction(t: Tx, g: Game, p: { queueId: string; cityId: string; kingdomId: string }) {
  await syncCity(t, g, p.cityId); // eski darajada tugash vaqtigacha hisoblab olamiz
  const q = await one<{ building_id: string; target_level: number }>(t,
    "UPDATE construction_queue SET state = 'done' WHERE id = $1 AND state = 'active' RETURNING building_id, target_level", [p.queueId]);
  if (!q) return; // bekor qilingan yoki allaqachon bajarilgan
  const b = await one<{ key: BuildingKey }>(t, 'UPDATE buildings SET level = $2 WHERE id = $1 RETURNING key', [q.building_id, q.target_level]);
  if (!b) return;
  if (b.key === 'devor') {
    const c = await one<{ culture: import('@qirolliklar/game-rules').Culture }>(t, 'SELECT k.culture FROM cities c JOIN kingdoms k ON k.id = c.kingdom_id WHERE c.id = $1', [p.cityId]);
    await t.query('UPDATE cities SET wall_hp = $2 WHERE id = $1', [p.cityId, wallMaxHp(q.target_level, c!.culture)]);
  }
  await notify(t, p.kingdomId, 'qurilish', `Qurilish tugadi: ${b.key} ${q.target_level}-daraja`);
  await pushRt(t, p.kingdomId, 'city_changed');
}
