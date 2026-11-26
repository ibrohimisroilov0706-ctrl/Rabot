// apps/server/src/services/common.ts
// Umumiy yordamchilar: o'yin konteksti, resurs yechish/qo'shish, xabarlar, audit, realtime.

import { RESOURCE_KEYS, storageCap, type ResourceKey, type Resources } from '@qirolliklar/game-rules';
import type { Db, Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad } from '../http/router.js';

export interface Game {
  pool: Db;
  speed: number;        // GAME_SPEED: barcha davomiyliklar shu songa bo'linadi
  shieldHours: number;
}

export const RT_CHANNEL = 'qrl_rt';

/** Real vaqt oralig'ini o'yin vaqtiga aylantiradi */
export const gameMs = (g: Game, realMs: number) => realMs * g.speed;
export const realDelay = (g: Game, gameDurationMs: number) => Math.max(1000, Math.round(gameDurationMs / g.speed));

export function roundRes(r: Partial<Resources>): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const [k, v] of Object.entries(r) as [ResourceKey, number][]) if (v) out[k] = Math.ceil(v);
  return out;
}

/** Resursni atomik yechadi. Yetmasa hech narsa o'zgarmaydi va 400 qaytadi. */
export async function spend(t: Tx, cityId: string, cost: Partial<Resources>): Promise<void> {
  const keys = (Object.keys(cost) as ResourceKey[]).filter(k => (cost[k] ?? 0) > 0);
  if (keys.length === 0) return;
  for (const k of keys) if (!RESOURCE_KEYS.includes(k)) throw new Error(`resurs ${k}`);
  const sets = keys.map((k, i) => `${k} = ${k} - $${i + 2}`).join(', ');
  const conds = keys.map((k, i) => `${k} >= $${i + 2}`).join(' AND ');
  const r = await t.query(`UPDATE resources SET ${sets} WHERE city_id = $1 AND ${conds} RETURNING city_id`, [cityId, ...keys.map(k => cost[k])]);
  if (!r.rowCount) {
    const have = await one(t, 'SELECT gold, food, wood, stone, iron, horses FROM resources WHERE city_id = $1', [cityId]);
    const missing = Object.fromEntries(keys.filter(k => (have?.[k] ?? 0) < (cost[k] ?? 0)).map(k => [k, Math.ceil((cost[k] ?? 0) - (have?.[k] ?? 0))]));
    throw bad('not_enough_resources', 'Resurs yetarli emas', { missing });
  }
}

/** Resurs qo'shadi, ombor sig'imidan oshgani yo'qoladi. Qo'shilgan miqdorni qaytaradi. */
export async function credit(t: Tx, cityId: string, add: Partial<Resources>): Promise<Partial<Resources>> {
  const omborL = (await one<{ level: number }>(t, "SELECT level FROM buildings WHERE city_id = $1 AND key = 'ombor'", [cityId]))?.level ?? 0;
  const before = await one(t, 'SELECT gold, food, wood, stone, iron, horses FROM resources WHERE city_id = $1 FOR UPDATE', [cityId]);
  if (!before) return {};
  const added: Partial<Resources> = {};
  const vals: number[] = [];
  for (const k of RESOURCE_KEYS) {
    const cap = storageCap(omborL, k);
    const next = Math.min(cap, (before[k] as number) + Math.max(0, add[k] ?? 0));
    added[k] = Math.max(0, next - (before[k] as number));
    vals.push(Math.max(next, before[k] as number));
  }
  await t.query('UPDATE resources SET gold=$2, food=$3, wood=$4, stone=$5, iron=$6, horses=$7 WHERE city_id=$1', [cityId, ...vals]);
  return added;
}

/** Yechish: borini oladi (manfiyga tushmaydi). Olingan miqdorni qaytaradi. */
export async function take(t: Tx, cityId: string, want: Partial<Resources>): Promise<Partial<Resources>> {
  const have = await one(t, 'SELECT gold, food, wood, stone, iron, horses FROM resources WHERE city_id = $1 FOR UPDATE', [cityId]);
  if (!have) return {};
  const got: Partial<Resources> = {};
  const vals: number[] = [];
  for (const k of RESOURCE_KEYS) {
    const g = Math.min(have[k] as number, Math.max(0, want[k] ?? 0));
    got[k] = g;
    vals.push((have[k] as number) - g);
  }
  await t.query('UPDATE resources SET gold=$2, food=$3, wood=$4, stone=$5, iron=$6, horses=$7 WHERE city_id=$1', [cityId, ...vals]);
  return got;
}

export async function schedule(t: Tx, type: string, dueAt: Date, payload: Record<string, unknown>, dedupeKey?: string): Promise<void> {
  await t.query(
    'INSERT INTO game_events (type, due_at, payload, dedupe_key) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT DO NOTHING',
    [type, dueAt, JSON.stringify(payload), dedupeKey ?? null],
  );
}

/** Realtime: pg_notify commit bo'lgandagina yetkaziladi, shuning uchun klient hech qachon "kelajakdan" xabar olmaydi. */
export async function pushRt(t: Tx, kingdomId: string | null, type: string, data: Record<string, unknown> = {}): Promise<void> {
  const payload = JSON.stringify({ k: kingdomId, type, data });
  if (payload.length > 7000) return;
  await t.query('SELECT pg_notify($1, $2)', [RT_CHANNEL, payload]);
}

export async function notify(t: Tx, kingdomId: string, type: string, title: string, body = '', data: Record<string, unknown> = {}): Promise<void> {
  await t.query('INSERT INTO notifications (kingdom_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [kingdomId, type, title, body, JSON.stringify(data)]);
  await pushRt(t, kingdomId, 'notification', { type, title });
}

export async function audit(t: Tx, a: { userId?: string; kingdomId?: string; action: string; ip?: string; details?: Record<string, unknown> }) {
  await t.query('INSERT INTO audit_logs (user_id, kingdom_id, action, ip, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [a.userId ?? null, a.kingdomId ?? null, a.action, a.ip ?? null, JSON.stringify(a.details ?? {})]);
}

export interface KingdomRow {
  id: string; user_id: string; name: string; culture: import('@qirolliklar/game-rules').Culture; ruler_name: string;
  ruler_generation: number; capital_city_id: string; king_city_id: string | null; reputation: number; noble_loyalty: number;
  regent_until: Date | null; shield_until: Date | null; traitor_until: Date | null; guest_killer_until: Date | null;
}

export async function kingdomById(t: Tx | Db, id: string, lock = false): Promise<KingdomRow> {
  const k = await one<KingdomRow & Record<string, unknown>>(t, `SELECT * FROM kingdoms WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!k) throw bad('no_kingdom', 'Qirollik topilmadi');
  return k;
}

export async function unitsOf(t: Tx | Db, armyId: string): Promise<Record<string, number>> {
  const rows = await many<{ unit_key: string; count: number }>(t, 'SELECT unit_key, count FROM army_units WHERE army_id = $1 AND count > 0', [armyId]);
  return Object.fromEntries(rows.map(r => [r.unit_key, r.count]));
}

export async function setUnits(t: Tx, armyId: string, units: Record<string, number>): Promise<void> {
  await t.query('DELETE FROM army_units WHERE army_id = $1', [armyId]);
  for (const [k, n] of Object.entries(units)) {
    if (n > 0) await t.query('INSERT INTO army_units (army_id, unit_key, count) VALUES ($1, $2, $3)', [armyId, k, Math.floor(n)]);
  }
}

export async function addUnits(t: Tx, armyId: string, units: Record<string, number>): Promise<void> {
  for (const [k, n] of Object.entries(units)) {
    if (n <= 0) continue;
    await t.query(
      'INSERT INTO army_units (army_id, unit_key, count) VALUES ($1, $2, $3) ON CONFLICT (army_id, unit_key) DO UPDATE SET count = army_units.count + EXCLUDED.count',
      [armyId, k, Math.floor(n)],
    );
  }
}

export const totalUnits = (u: Record<string, number>) => Object.values(u).reduce((s, n) => s + n, 0);

/** Dala qo'shinini o'chiradi. Avval uning ochiq xizmat shartnomasini yopadi (tarix saqlanadi). Garnizon o'chirilmaydi. */
export async function deleteFieldArmy(t: Tx, armyId: string, reason = 'qoshin_yoq_qilindi'): Promise<void> {
  const svc = await many<{ owner_kingdom_id: string; host_kingdom_id: string; state: string }>(t,
    `UPDATE army_service SET state = CASE WHEN state = 'taklif' THEN 'rad_etildi'::contract_state ELSE 'yopildi'::contract_state END, closed_reason = $2
     WHERE army_id = $1 AND state IN ('taklif','faol') RETURNING owner_kingdom_id, host_kingdom_id, state`, [armyId, reason]);
  for (const s of svc) for (const k of [s.owner_kingdom_id, s.host_kingdom_id]) await notify(t, k, 'xizmat', 'Xizmat shartnomasi yopildi', 'Qo\'shin yo\'q qilindi');
  await t.query("DELETE FROM armies WHERE id = $1 AND kind = 'field'", [armyId]);
}
