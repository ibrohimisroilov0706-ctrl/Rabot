// apps/server/src/services/army.ts
// Yollash, yurish, qaytish. Egalik qoidasi: owner_kingdom_id hech qachon o'zgarmaydi;
// boshqa qirol faqat faol xizmat shartnomasi va command_level orqali buyruq bera oladi.

import {
  BASE_UNITS, CULTURES, SPECIAL_UNITS, marchDurationMs, unitDef, type Culture, type Resources,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../http/router.js';
import { capitalOf, syncCity } from './city.js';
import {
  addUnits, audit, credit, deleteFieldArmy, kingdomById, notify, pushRt, realDelay, schedule, setUnits, spend, totalUnits, unitsOf, type Game,
} from './common.js';
import { applyBetrayal, checkAttack } from './diplomacy.js';

export function allowedUnits(c: Culture): string[] {
  return [...Object.keys(BASE_UNITS), ...SPECIAL_UNITS.filter(u => u.culture === c).map(u => u.key)];
}

/** Qaysi bino va qaysi darajasi kerak */
export function requirement(unitKey: string): { building: 'kazarma' | 'otxona' | 'ustaxona'; level: number } {
  const u = unitDef(unitKey);
  const special = !!u.culture;
  const building = u.cls === 'otliq' || u.cls === 'ogir_otliq' ? (u.key === 'jangovar_fil' ? 'kazarma' : 'otxona') : u.cls === 'qamal' ? 'ustaxona' : 'kazarma';
  return { building, level: special ? 3 : u.cls === 'ogir_otliq' ? 2 : 1 };
}

export function unitCost(unitKey: string, culture: Culture, count: number): Partial<Resources> {
  const u = unitDef(unitKey);
  const mult = 1 + (CULTURES[culture].bonuses.unitCost[u.cls] ?? 0);
  return Object.fromEntries(Object.entries(u.cost).map(([k, v]) => [k, Math.ceil(v * mult * count)]));
}

export async function garrisonOf(t: Tx, cityId: string, lock = false) {
  const a = await one<{ id: string }>(t, `SELECT id FROM armies WHERE home_city_id = $1 AND kind = 'garrison'${lock ? ' FOR UPDATE' : ''}`, [cityId]);
  if (!a) throw notFound('Garnizon topilmadi');
  return a.id;
}

export async function recruit(t: Tx, g: Game, kingdomId: string, input: { unitKey: string; count: number }) {
  const k = await kingdomById(t, kingdomId);
  if (!allowedUnits(k.culture).includes(input.unitKey)) throw bad('bad_unit', 'Bu birlik sizning millatingizda yo\'q');
  const cityId = await capitalOf(t, kingdomId);
  const s = await syncCity(t, g, cityId);
  const req = requirement(input.unitKey);
  const L = s.level(req.building);
  if (L < req.level) throw conflict('building_required', `${req.building} kamida ${req.level}-daraja bo'lishi kerak`);
  const cost = unitCost(input.unitKey, k.culture, input.count);
  await spend(t, cityId, cost);
  const perUnitMs = unitDef(input.unitKey).trainSec * 1000 * Math.max(0.55, 1 - 0.05 * (L - 1));
  const last = await one<{ due: Date }>(t, `SELECT max(due_at) AS due FROM game_events WHERE type = 'recruit_complete' AND state = 'pending' AND payload->>'cityId' = $1`, [cityId]);
  const start = Math.max(Date.now(), last?.due?.getTime() ?? 0);
  const due = new Date(start + realDelay(g, perUnitMs * input.count));
  await schedule(t, 'recruit_complete', due, { cityId, kingdomId, unitKey: input.unitKey, count: input.count });
  return { unitKey: input.unitKey, count: input.count, readyAt: due.toISOString(), cost };
}

/** World Engine: recruit_complete */
export async function completeRecruit(t: Tx, g: Game, p: { cityId: string; kingdomId: string; unitKey: string; count: number }) {
  await syncCity(t, g, p.cityId);
  const gid = await garrisonOf(t, p.cityId, true);
  await addUnits(t, gid, { [p.unitKey]: p.count });
  await notify(t, p.kingdomId, 'yollash', `${p.count} ta ${unitDef(p.unitKey).name} tayyor`);
  await pushRt(t, p.kingdomId, 'army_changed');
}

interface ArmyRow {
  id: string; owner_kingdom_id: string; serving_kingdom_id: string | null; home_city_id: string; culture: Culture; kind: string;
  status: string; commander_id: string | null; x: number; y: number; station_city_id: string | null; mission: string;
}

export async function armyById(t: Tx, id: string, lock = false): Promise<ArmyRow> {
  const a = await one<ArmyRow & Record<string, unknown>>(t, `SELECT * FROM armies WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!a) throw notFound('Qo\'shin topilmadi');
  return a;
}

/** Qo'shinni yo'lga chiqaradi (umumiy yordamchi). */
export async function dispatch(t: Tx, g: Game, armyId: string, to: { x: number; y: number; cityId: string | null }, mission: 'attack' | 'return' | 'station') {
  const a = await armyById(t, armyId, true);
  const units = await unitsOf(t, armyId);
  if (totalUnits(units) === 0) { await deleteFieldArmy(t, armyId); return null; }
  const ms = realDelay(g, marchDurationMs(Object.keys(units), a.culture, a.x, a.y, to.x, to.y));
  const arrive = new Date(Date.now() + ms);
  await t.query(`UPDATE armies SET status = $2, mission = $3, from_x = x, from_y = y, to_x = $4, to_y = $5, target_city_id = $6,
    depart_at = now(), arrive_at = $7 WHERE id = $1`, [armyId, mission === 'return' ? 'returning' : 'marching', mission, to.x, to.y, to.cityId, arrive]);
  await schedule(t, 'army_arrival', arrive, { armyId });
  await pushRt(t, null, 'world_changed');
  return arrive;
}

export async function march(t: Tx, g: Game, me: string, input: { armyId?: string; units?: Record<string, number>; targetCityId: string; commanderId?: string }, ip?: string) {
  const target = await one<{ id: string; kingdom_id: string; x: number; y: number }>(t, 'SELECT id, kingdom_id, x, y FROM cities WHERE id = $1', [input.targetCityId]);
  if (!target) throw notFound('Nishon shahar topilmadi');
  const { alliedBetrayal } = await checkAttack(t, me, target.kingdom_id);
  let armyId: string;

  if (input.armyId) {
    // Xizmatdagi qo'shinga xost buyrug'i
    const a = await armyById(t, input.armyId, true);
    if (a.owner_kingdom_id === me && a.serving_kingdom_id) throw forbidden('in_service', 'Qo\'shin hozir boshqa qirolga xizmat qilmoqda');
    if (a.serving_kingdom_id !== me) throw forbidden('not_commander', 'Bu qo\'shinga buyruq bera olmaysiz');
    const svc = await one<{ command_level: number }>(t, "SELECT command_level FROM army_service WHERE army_id = $1 AND state = 'faol'", [a.id]);
    if (!svc || svc.command_level < 1) throw forbidden('command_level', 'Shartnoma faqat mudofaaga ruxsat beradi');
    if (a.status !== 'stationed') throw conflict('busy', 'Qo\'shin hozir yo\'lda');
    if (target.kingdom_id === a.owner_kingdom_id) throw forbidden('own_master', 'Qo\'shinni o\'z egasiga qarshi yuborib bo\'lmaydi');
    armyId = a.id;
  } else {
    const units = input.units ?? {};
    if (totalUnits(units) <= 0) throw bad('no_units', 'Kamida bitta askar tanlang');
    const cityId = await capitalOf(t, me);
    const s = await syncCity(t, g, cityId);
    const gid = await garrisonOf(t, cityId, true);
    const have = await unitsOf(t, gid);
    for (const [k, n] of Object.entries(units)) {
      if (!Number.isInteger(n) || n < 0) throw bad('bad_count', 'Son butun bo\'lsin');
      if ((have[k] ?? 0) < n) throw conflict('not_enough_units', `${k}: garnizonda ${have[k] ?? 0} ta bor`);
    }
    const left = Object.fromEntries(Object.entries(have).map(([k, n]) => [k, n - (units[k] ?? 0)]));
    await setUnits(t, gid, left);
    let commanderId: string | null = null;
    if (input.commanderId) {
      const c = await one(t, `SELECT id FROM commanders WHERE id = $1 AND kingdom_id = $2 AND alive AND captured_by IS NULL
        AND NOT EXISTS (SELECT 1 FROM armies WHERE commander_id = $1)`, [input.commanderId, me]);
      if (!c) throw conflict('commander_busy', 'General band yoki topilmadi');
      commanderId = input.commanderId;
    }
    const a = await one<{ id: string }>(t, `INSERT INTO armies (owner_kingdom_id, home_city_id, culture, kind, status, commander_id, x, y)
      VALUES ($1, $2, $3, 'field', 'home', $4, $5, $6) RETURNING id`, [me, cityId, s.culture, commanderId, s.city.x, s.city.y]);
    armyId = a!.id;
    await setUnits(t, armyId, units);
  }
  if (alliedBetrayal) await applyBetrayal(t, alliedBetrayal, me, target.kingdom_id);
  const arrive = await dispatch(t, g, armyId, { x: target.x, y: target.y, cityId: target.id }, 'attack');
  await audit(t, { kingdomId: me, action: 'march', ip, details: { armyId, target: target.id } });
  const k = await kingdomById(t, me);
  await notify(t, target.kingdom_id, 'hujum_kelmoqda', `${k.name} qo'shini sizga yo'l oldi`, `Yetib kelish: ${arrive?.toISOString()}`);
  return { armyId, arriveAt: arrive?.toISOString() };
}

/** Qaytgan qo'shin: xizmatda bo'lsa xost poytaxtida turadi, aks holda garnizonga qo'shiladi. */
export async function settleAtHome(t: Tx, armyId: string) {
  const a = await armyById(t, armyId, true);
  if (a.serving_kingdom_id && a.station_city_id) {
    const c = await one<{ x: number; y: number }>(t, 'SELECT x, y FROM cities WHERE id = $1', [a.station_city_id]);
    await t.query(`UPDATE armies SET status = 'stationed', mission = 'none', x = $2, y = $3, arrive_at = NULL, target_city_id = NULL WHERE id = $1`, [armyId, c!.x, c!.y]);
    return;
  }
  const gid = await garrisonOf(t, a.home_city_id, true);
  const units = await unitsOf(t, armyId);
  await addUnits(t, gid, units);
  const loot = (await one<{ loot: Record<string, number> }>(t, 'SELECT loot FROM armies WHERE id = $1', [armyId]))!.loot;
  if (Object.keys(loot).length) await credit(t, a.home_city_id, loot);
  await t.query('DELETE FROM armies WHERE id = $1', [armyId]);
  await notify(t, a.owner_kingdom_id, 'qaytish', 'Qo\'shin uyga qaytdi', Object.keys(loot).length ? `O'lja: ${JSON.stringify(loot)}` : '');
  await pushRt(t, a.owner_kingdom_id, 'army_changed');
}

export async function listArmies(t: Tx, me: string) {
  return many(t, `
    SELECT a.id, a.kind, a.status, a.mission, a.culture, a.x, a.y, a.from_x, a.from_y, a.to_x, a.to_y, a.depart_at, a.arrive_at, a.xp,
           a.owner_kingdom_id, a.serving_kingdom_id, ko.name AS owner_name, ks.name AS serving_name, a.target_city_id,
           COALESCE((SELECT jsonb_object_agg(unit_key, count) FROM army_units WHERE army_id = a.id AND count > 0), '{}'::jsonb) AS units
    FROM armies a JOIN kingdoms ko ON ko.id = a.owner_kingdom_id LEFT JOIN kingdoms ks ON ks.id = a.serving_kingdom_id
    WHERE a.owner_kingdom_id = $1 OR a.serving_kingdom_id = $1
    ORDER BY a.kind DESC, a.created_at`, [me]);
}
