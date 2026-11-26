// apps/server/src/services/diplomacy.ts
// Shartnomalar, ishonch (T) va hujum ruxsati. GDD 7-bo'lim, 02 Formulalar 3-bo'lim.

import { CULTURES, clamp } from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../http/router.js';
import { kingdomById, notify, pushRt, realDelay, schedule, type Game } from './common.js';

export type TreatyType = 'ittifoq' | 'savdo' | 'tinchlik' | 'urush' | 'nikoh';
export const TREATY_LIMITS: Record<TreatyType, { min: number; max: number }> = {
  ittifoq: { min: 7 * 24, max: 90 * 24 }, savdo: { min: 7 * 24, max: 30 * 24 }, tinchlik: { min: 3 * 24, max: 30 * 24 },
  urush: { min: 1, max: 90 * 24 }, nikoh: { min: 90 * 24, max: 90 * 24 },
};
const BREAK_PENALTY: Record<TreatyType, number> = { ittifoq: -40, savdo: -15, tinchlik: 0, urush: 0, nikoh: -60 };

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

export async function getTrust(t: Tx, a: string, b: string): Promise<number> {
  const [x, y] = pair(a, b);
  return (await one<{ value: number }>(t, 'SELECT value FROM diplomatic_trust WHERE kingdom_a = $1 AND kingdom_b = $2', [x, y]))?.value ?? 0;
}

export async function adjustTrust(t: Tx, a: string, b: string, delta: number): Promise<number> {
  if (a === b || delta === 0) return getTrust(t, a, b);
  const [x, y] = pair(a, b);
  const r = await one<{ value: number }>(t, `
    INSERT INTO diplomatic_trust (kingdom_a, kingdom_b, value) VALUES ($1, $2, $3)
    ON CONFLICT (kingdom_a, kingdom_b) DO UPDATE SET value = GREATEST(-100, LEAST(100, diplomatic_trust.value + $4)), updated_at = now()
    RETURNING value`, [x, y, clamp(Math.round(delta), -100, 100), Math.round(delta)]);
  return r!.value;
}

export async function adjustReputation(t: Tx, kingdomId: string, delta: number) {
  await t.query('UPDATE kingdoms SET reputation = GREATEST(-100, LEAST(100, reputation + $2)) WHERE id = $1', [kingdomId, Math.round(delta)]);
}

export async function activeTreaty(t: Tx, a: string, b: string, type: TreatyType) {
  return one<{ id: string; starts_at: Date }>(t, `
    SELECT id, starts_at FROM diplomacy WHERE type = $3 AND state = 'faol'
      AND ((from_kingdom_id = $1 AND to_kingdom_id = $2) OR (from_kingdom_id = $2 AND to_kingdom_id = $1))
    LIMIT 1`, [a, b, type]);
}

/** Hujum ruxsati. Ittifoqchiga hujum mumkin, lekin bu xiyonat (alliedBetrayal = true). */
export async function checkAttack(t: Tx, attackerId: string, defenderId: string): Promise<{ alliedBetrayal: string | null }> {
  if (attackerId === defenderId) throw bad('self_attack', 'O\'zingizga hujum qila olmaysiz');
  const d = await kingdomById(t, defenderId);
  if (d.shield_until && d.shield_until.getTime() > Date.now()) throw forbidden('shielded', 'Bu qirollik himoya qalqoni ostida');
  if (await activeTreaty(t, attackerId, defenderId, 'tinchlik')) throw forbidden('peace', 'Tinchlik shartnomasi amal qilmoqda');
  const ally = await activeTreaty(t, attackerId, defenderId, 'ittifoq');
  return { alliedBetrayal: ally?.id ?? null };
}

/** Ittifoqchiga hujum: shartnoma buziladi, T -80, obro' -20, "Xoin" 7 kun. */
export async function applyBetrayal(t: Tx, treatyId: string, traitorId: string, victimId: string) {
  await t.query("UPDATE diplomacy SET state = 'buzildi', broken_by = $2, ends_at = now() WHERE id = $1", [treatyId, traitorId]);
  await adjustTrust(t, traitorId, victimId, -80);
  await adjustReputation(t, traitorId, -20);
  await t.query("UPDATE kingdoms SET traitor_until = now() + interval '7 days', noble_loyalty = GREATEST(0, noble_loyalty - 15) WHERE id = $1", [traitorId]);
  await notify(t, victimId, 'xiyonat', 'Ittifoqchingiz sizga xiyonat qildi', 'Ittifoq shartnomasi buzildi.');
}

export async function propose(t: Tx, g: Game, fromId: string, input: { toKingdomId: string; type: TreatyType; hours: number }) {
  if (fromId === input.toKingdomId) throw bad('self', 'O\'zingiz bilan shartnoma tuzib bo\'lmaydi');
  const lim = TREATY_LIMITS[input.type];
  if (input.hours < lim.min || input.hours > lim.max) throw bad('bad_duration', `Muddat ${lim.min}-${lim.max} soat bo'lishi kerak`);
  await kingdomById(t, input.toKingdomId);
  if (await activeTreaty(t, fromId, input.toKingdomId, input.type)) throw conflict('exists', 'Bunday shartnoma allaqachon faol');
  const from = await kingdomById(t, fromId);

  if (input.type === 'urush') {
    // Urush e'loni qabul talab qilmaydi; 12 soatdan keyin kuchga kiradi.
    if (await activeTreaty(t, fromId, input.toKingdomId, 'tinchlik')) throw forbidden('peace', 'Tinchlik shartnomasi amal qilmoqda');
    const starts = new Date(Date.now() + realDelay(g, 12 * 3_600_000));
    const ends = new Date(starts.getTime() + realDelay(g, input.hours * 3_600_000));
    const r = await one<{ id: string }>(t, `INSERT INTO diplomacy (type, from_kingdom_id, to_kingdom_id, state, duration_hours, starts_at, ends_at)
      VALUES ('urush', $1, $2, 'faol', $3, $4, $5) RETURNING id`, [fromId, input.toKingdomId, input.hours, starts, ends]);
    await schedule(t, 'treaty_expire', ends, { treatyId: r!.id });
    await adjustTrust(t, fromId, input.toKingdomId, -30);
    await notify(t, input.toKingdomId, 'urush', `${from.name} sizga urush e'lon qildi`, `Urush ${starts.toISOString()} dan boshlanadi.`);
    return { id: r!.id, state: 'faol' };
  }
  const pending = await one(t, `SELECT id FROM diplomacy WHERE type = $3 AND state = 'taklif'
    AND ((from_kingdom_id = $1 AND to_kingdom_id = $2) OR (from_kingdom_id = $2 AND to_kingdom_id = $1))`, [fromId, input.toKingdomId, input.type]);
  if (pending) throw conflict('pending', 'Bunday taklif allaqachon kutilmoqda');
  const r = await one<{ id: string }>(t, `INSERT INTO diplomacy (type, from_kingdom_id, to_kingdom_id, duration_hours)
    VALUES ($1, $2, $3, $4) RETURNING id`, [input.type, fromId, input.toKingdomId, input.hours]);
  await notify(t, input.toKingdomId, 'diplomatiya', `${from.name}: ${input.type} taklifi`, `Muddat: ${input.hours} soat`, { treatyId: r!.id });
  return { id: r!.id, state: 'taklif' };
}

export async function respond(t: Tx, g: Game, me: string, treatyId: string, accept: boolean) {
  const d = await one<{ id: string; type: TreatyType; from_kingdom_id: string; to_kingdom_id: string; duration_hours: number; state: string }>(t,
    'SELECT * FROM diplomacy WHERE id = $1 FOR UPDATE', [treatyId]);
  if (!d) throw notFound('Shartnoma topilmadi');
  if (d.to_kingdom_id !== me) throw forbidden('not_yours', 'Bu taklif sizga emas');
  if (d.state !== 'taklif') throw conflict('not_pending', 'Taklif allaqachon ko\'rib chiqilgan');
  if (!accept) {
    await t.query("UPDATE diplomacy SET state = 'rad_etildi' WHERE id = $1", [treatyId]);
    await notify(t, d.from_kingdom_id, 'diplomatiya', `${d.type} taklifingiz rad etildi`);
    return { state: 'rad_etildi' };
  }
  if (await activeTreaty(t, d.from_kingdom_id, d.to_kingdom_id, d.type)) throw conflict('exists', 'Bunday shartnoma allaqachon faol');
  const ends = new Date(Date.now() + realDelay(g, d.duration_hours * 3_600_000));
  await t.query("UPDATE diplomacy SET state = 'faol', starts_at = now(), ends_at = $2 WHERE id = $1", [treatyId, ends]);
  await schedule(t, 'treaty_expire', ends, { treatyId });
  if (d.type === 'nikoh') await adjustTrust(t, d.from_kingdom_id, d.to_kingdom_id, 20);
  if (d.type === 'tinchlik') {
    await t.query("UPDATE diplomacy SET state = 'tugadi', ends_at = now() WHERE type = 'urush' AND state = 'faol' AND ((from_kingdom_id = $1 AND to_kingdom_id = $2) OR (from_kingdom_id = $2 AND to_kingdom_id = $1))", [d.from_kingdom_id, d.to_kingdom_id]);
  }
  await notify(t, d.from_kingdom_id, 'diplomatiya', `${d.type} taklifingiz qabul qilindi`);
  await pushRt(t, d.from_kingdom_id, 'diplomacy_changed');
  return { state: 'faol', endsAt: ends.toISOString() };
}

export async function breakTreaty(t: Tx, me: string, treatyId: string) {
  const d = await one<{ id: string; type: TreatyType; from_kingdom_id: string; to_kingdom_id: string; state: string }>(t,
    'SELECT * FROM diplomacy WHERE id = $1 FOR UPDATE', [treatyId]);
  if (!d || (d.from_kingdom_id !== me && d.to_kingdom_id !== me)) throw notFound('Shartnoma topilmadi');
  if (d.state !== 'faol') throw conflict('not_active', 'Shartnoma faol emas');
  if (d.type === 'tinchlik') throw forbidden('unbreakable', 'Tinchlik shartnomasini buzib bo\'lmaydi');
  if (d.type === 'urush') throw bad('use_peace', 'Urushni tugatish uchun tinchlik taklif qiling');
  const other = d.from_kingdom_id === me ? d.to_kingdom_id : d.from_kingdom_id;
  await t.query("UPDATE diplomacy SET state = 'buzildi', broken_by = $2, ends_at = now() WHERE id = $1", [treatyId, me]);
  const trust = await adjustTrust(t, me, other, BREAK_PENALTY[d.type]);
  if (d.type === 'ittifoq') await t.query("UPDATE kingdoms SET traitor_until = now() + interval '7 days' WHERE id = $1", [me]);
  await notify(t, other, 'diplomatiya', `${d.type} shartnomasi buzildi`, `Ishonch: ${trust}`);
  return { trust };
}

/** World Engine: treaty_expire */
export async function expireTreaty(t: Tx, p: { treatyId: string }) {
  const d = await one<{ type: TreatyType; from_kingdom_id: string; to_kingdom_id: string }>(t,
    "UPDATE diplomacy SET state = 'tugadi' WHERE id = $1 AND state = 'faol' AND ends_at <= now() + interval '1 second' RETURNING type, from_kingdom_id, to_kingdom_id", [p.treatyId]);
  if (!d) return;
  if (d.type !== 'urush') await adjustTrust(t, d.from_kingdom_id, d.to_kingdom_id, 10);
  for (const k of [d.from_kingdom_id, d.to_kingdom_id]) await notify(t, k, 'diplomatiya', `${d.type} shartnomasi muddati tugadi`);
}

/** Kunlik: faol shartnoma ishonchni +1 (Usmonlilarda +1.25 -> yaxlitlab) oshiradi; shartnomasiz juftlar 0 ga qaytadi. */
export async function dailyTrust(t: Tx) {
  const rows = await many<{ a: string; b: string; ca: string; cb: string }>(t, `
    SELECT DISTINCT d.from_kingdom_id AS a, d.to_kingdom_id AS b, ka.culture AS ca, kb.culture AS cb
    FROM diplomacy d JOIN kingdoms ka ON ka.id = d.from_kingdom_id JOIN kingdoms kb ON kb.id = d.to_kingdom_id
    WHERE d.state = 'faol' AND d.type <> 'urush'`);
  const touched = new Set<string>();
  for (const r of rows) {
    const bonus = Math.max(CULTURES[r.ca as 'rus'].bonuses.trustGain, CULTURES[r.cb as 'rus'].bonuses.trustGain);
    await adjustTrust(t, r.a, r.b, Math.round(1 + bonus));
    touched.add(pair(r.a, r.b).join(':'));
  }
  const all = await many<{ kingdom_a: string; kingdom_b: string; value: number }>(t, 'SELECT kingdom_a, kingdom_b, value FROM diplomatic_trust WHERE value <> 0');
  for (const r of all) {
    if (touched.has(`${r.kingdom_a}:${r.kingdom_b}`)) continue;
    await t.query('UPDATE diplomatic_trust SET value = value - sign(value)::int, updated_at = now() WHERE kingdom_a = $1 AND kingdom_b = $2', [r.kingdom_a, r.kingdom_b]);
  }
}

export async function listDiplomacy(t: Tx, me: string) {
  const treaties = await many(t, `
    SELECT d.id, d.type, d.state, d.from_kingdom_id, d.to_kingdom_id, d.starts_at, d.ends_at, d.duration_hours, d.created_at,
           kf.name AS from_name, kt.name AS to_name
    FROM diplomacy d JOIN kingdoms kf ON kf.id = d.from_kingdom_id JOIN kingdoms kt ON kt.id = d.to_kingdom_id
    WHERE (d.from_kingdom_id = $1 OR d.to_kingdom_id = $1) AND (d.state IN ('taklif','faol') OR d.created_at > now() - interval '3 days')
    ORDER BY d.created_at DESC LIMIT 100`, [me]);
  const trust = await many(t, `
    SELECT CASE WHEN kingdom_a = $1 THEN kingdom_b ELSE kingdom_a END AS kingdom_id, value, k.name
    FROM diplomatic_trust dt JOIN kingdoms k ON k.id = CASE WHEN kingdom_a = $1 THEN kingdom_b ELSE kingdom_a END
    WHERE kingdom_a = $1 OR kingdom_b = $1 ORDER BY value DESC`, [me]);
  return { treaties, trust };
}
