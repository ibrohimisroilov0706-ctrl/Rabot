// apps/server/src/services/service.ts
// Xizmat shartnomalari (yollanma, ittifoqchi, vassal) va sadoqat qoidalari R1-R7.
// Asosiy invariant: shartnoma faqat armies.serving_kingdom_id ni o'zgartiradi, owner_kingdom_id hech qachon o'zgarmaydi.

import {
  computeRates, economicDailyDesertShare, evaluateServiceLoyalty, loyaltyScore, rng, unitDef, warProbability,
  type Culture, type LoyaltyInputs,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../http/router.js';
import { armyById, dispatch, garrisonOf, settleAtHome } from './army.js';
import { capitalOf, syncCity } from './city.js';
import {
  audit, credit, gameMs, kingdomById, notify, pushRt, realDelay, schedule, setUnits, spend, take, totalUnits, unitsOf, type Game,
} from './common.js';
import { adjustTrust, getTrust } from './diplomacy.js';

export type ServiceStatus = 'ittifoqchi' | 'vassal' | 'yollanma';

interface ServiceRow {
  id: string; army_id: string; owner_kingdom_id: string; host_kingdom_id: string; status: ServiceStatus; state: string;
  pay_per_hour: number; command_level: number; tribute_pct: number; duration_hours: number; starts_at: Date | null; ends_at: Date | null;
  wins: number; losses: number; total_wins: number; total_losses: number; paid_total: number; owed_total: number; unpaid_since: Date | null; last_settled_at: Date | null;
  generosity_until: Date | null;
}

export async function offerService(t: Tx, g: Game, me: string, input: {
  hostKingdomId: string; status: ServiceStatus; units: Record<string, number>; payPerHour: number; hours: number; commandLevel: number; tributePct: number;
}, ip?: string) {
  if (input.hostKingdomId === me) throw bad('self', 'O\'zingizga xizmat qila olmaysiz');
  const host = await kingdomById(t, input.hostKingdomId);
  const owner = await kingdomById(t, me);
  if (input.status === 'vassal' && input.hours < 7 * 24) throw bad('vassal_min', 'Vassallik kamida 7 kun (168 soat)');
  const commandLevel = input.status === 'ittifoqchi' ? 0 : input.status === 'vassal' ? 1 : input.commandLevel;
  const pay = input.status === 'yollanma' ? input.payPerHour : 0;
  const tribute = input.status === 'vassal' ? input.tributePct : 0;
  if (input.status === 'vassal' && (tribute < 5 || tribute > 30)) throw bad('tribute', 'O\'lpon 5-30% bo\'lishi kerak (D-19)');

  const cityId = await capitalOf(t, me);
  const s = await syncCity(t, g, cityId);
  const gid = await garrisonOf(t, cityId, true);
  const have = await unitsOf(t, gid);
  if (totalUnits(input.units) <= 0) throw bad('no_units', 'Kamida bitta askar tanlang');
  for (const [k, n] of Object.entries(input.units)) if ((have[k] ?? 0) < n) throw conflict('not_enough_units', `${k}: garnizonda ${have[k] ?? 0} ta bor`);
  await setUnits(t, gid, Object.fromEntries(Object.entries(have).map(([k, n]) => [k, n - (input.units[k] ?? 0)])));
  const a = await one<{ id: string }>(t, `INSERT INTO armies (owner_kingdom_id, home_city_id, culture, kind, status, x, y)
    VALUES ($1, $2, $3, 'field', 'home', $4, $5) RETURNING id`, [me, cityId, s.culture, s.city.x, s.city.y]);
  await setUnits(t, a!.id, input.units);
  const svc = await one<{ id: string }>(t, `INSERT INTO army_service (army_id, owner_kingdom_id, host_kingdom_id, status, pay_per_hour, command_level, tribute_pct, duration_hours)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [a!.id, me, host.id, input.status, pay, commandLevel, tribute, input.hours]);
  await notify(t, host.id, 'xizmat', `${owner.name} sizga xizmat taklif qilmoqda`,
    `${input.status}, ${totalUnits(input.units)} askar, ${pay} oltin/soat, ${input.hours} soat`, { serviceId: svc!.id });
  await audit(t, { kingdomId: me, action: 'service_offer', ip, details: { serviceId: svc!.id, ...input } });
  return { serviceId: svc!.id, armyId: a!.id };
}

async function serviceForUpdate(t: Tx, id: string): Promise<ServiceRow> {
  const s = await one<ServiceRow & Record<string, unknown>>(t, 'SELECT * FROM army_service WHERE id = $1 FOR UPDATE', [id]);
  if (!s) throw notFound('Shartnoma topilmadi');
  return s;
}

export async function respondService(t: Tx, g: Game, me: string, id: string, accept: boolean) {
  const s = await serviceForUpdate(t, id);
  if (s.host_kingdom_id !== me) throw forbidden('not_host', 'Bu taklif sizga emas');
  if (s.state !== 'taklif') throw conflict('not_pending', 'Taklif allaqachon ko\'rib chiqilgan');
  if (!accept) {
    await t.query("UPDATE army_service SET state = 'rad_etildi', closed_reason = 'rad' WHERE id = $1", [id]);
    await returnArmyHome(t, g, s.army_id);
    await notify(t, s.owner_kingdom_id, 'xizmat', 'Xizmat taklifingiz rad etildi');
    return { state: 'rad_etildi' };
  }
  const hostCapital = await capitalOf(t, me);
  const c = await one<{ x: number; y: number }>(t, 'SELECT x, y FROM cities WHERE id = $1', [hostCapital]);
  const ends = new Date(Date.now() + realDelay(g, s.duration_hours * 3_600_000));
  await t.query(`UPDATE army_service SET state = 'faol', starts_at = now(), ends_at = $2, last_settled_at = now() WHERE id = $1`, [id, ends]);
  await t.query('UPDATE armies SET serving_kingdom_id = $2, station_city_id = $3 WHERE id = $1', [s.army_id, me, hostCapital]);
  await dispatch(t, g, s.army_id, { x: c!.x, y: c!.y, cityId: hostCapital }, 'station');
  await schedule(t, 'service_expire', ends, { serviceId: id });
  await notify(t, s.owner_kingdom_id, 'xizmat', 'Xizmat shartnomasi qabul qilindi', `Muddat: ${ends.toISOString()}`);
  return { state: 'faol', endsAt: ends.toISOString() };
}

/** Qo'shinni egasiga qaytaradi: serving bekor, uyga yuriladi (yoki allaqachon uyda bo'lsa garnizonga qo'shiladi). */
export async function returnArmyHome(t: Tx, g: Game, armyId: string) {
  const a = await armyById(t, armyId, true);
  await t.query('UPDATE armies SET serving_kingdom_id = NULL, station_city_id = NULL WHERE id = $1', [armyId]);
  const home = await one<{ x: number; y: number }>(t, 'SELECT x, y FROM cities WHERE id = $1', [a.home_city_id]);
  if (Math.abs(a.x - home!.x) < 0.01 && Math.abs(a.y - home!.y) < 0.01 && a.status !== 'marching' && a.status !== 'returning') {
    await settleAtHome(t, armyId);
    return;
  }
  if (a.status === 'marching' || a.status === 'returning') {
    // yo'lda bo'lsa: joriy manzilga yetgach army_arrival qaytishni boshlaydi (mission = return)
    await t.query("UPDATE armies SET mission = 'return', to_x = $2, to_y = $3, target_city_id = NULL WHERE id = $1 AND mission = 'station'", [armyId, home!.x, home!.y]);
    return;
  }
  await dispatch(t, g, armyId, { x: home!.x, y: home!.y, cityId: null }, 'return');
}

export async function closeService(t: Tx, g: Game, id: string, reason: string) {
  const s = await one<ServiceRow>(t, "UPDATE army_service SET state = 'yopildi', closed_reason = $2 WHERE id = $1 AND state = 'faol' RETURNING *", [id, reason]);
  if (!s) return null;
  await settleOne(t, g, s.id);
  await returnArmyHome(t, g, s.army_id);
  await t.query("UPDATE game_events SET state = 'done' WHERE type = 'service_expire' AND state = 'pending' AND payload->>'serviceId' = $1", [id]);
  for (const k of [s.owner_kingdom_id, s.host_kingdom_id]) {
    await notify(t, k, 'xizmat', 'Xizmat shartnomasi yopildi', `Sabab: ${reason}`);
    await pushRt(t, k, 'army_changed');
  }
  return s;
}

export async function leaveService(t: Tx, g: Game, me: string, id: string) {
  const s = await serviceForUpdate(t, id);
  if (s.state !== 'faol') throw conflict('not_active', 'Shartnoma faol emas');
  if (s.owner_kingdom_id === me) {
    // Erta chiqish jarimasi: shartnoma qiymatining 25% i (yollanma), vassal uchun ishonch -40
    const unpaid48 = s.unpaid_since && Date.now() - s.unpaid_since.getTime() >= realDelay(g, 48 * 3_600_000);
    if (!unpaid48) {
      if (s.status === 'yollanma') {
        const penalty = Math.ceil(0.25 * s.pay_per_hour * s.duration_hours);
        const ownerCap = await capitalOf(t, me);
        await syncCity(t, g, ownerCap);
        const got = await take(t, ownerCap, { gold: penalty });
        await credit(t, await capitalOf(t, s.host_kingdom_id), got);
      }
      if (s.status === 'vassal') await adjustTrust(t, me, s.host_kingdom_id, -40);
    }
    await closeService(t, g, id, unpaid48 ? 'maosh_tolanmadi' : 'erta_chiqish');
  } else if (s.host_kingdom_id === me) {
    await closeService(t, g, id, 'xost_boshatdi');
  } else throw forbidden('not_party', 'Siz bu shartnoma tomoni emassiz');
  return { ok: true };
}

export async function generosity(t: Tx, g: Game, me: string, id: string) {
  const s = await serviceForUpdate(t, id);
  if (s.host_kingdom_id !== me || s.state !== 'faol') throw forbidden('not_host', 'Faqat xost faol shartnomada saxiylik qila oladi');
  const cost = Math.max(500, 10 * s.pay_per_hour);
  const cap = await capitalOf(t, me);
  await syncCity(t, g, cap);
  await spend(t, cap, { gold: cost });
  const until = new Date(Date.now() + realDelay(g, 72 * 3_600_000));
  await t.query('UPDATE army_service SET generosity_until = $2 WHERE id = $1', [id, until]);
  await notify(t, s.owner_kingdom_id, 'xizmat', 'Xost qo\'shiningizga saxiylik ko\'rsatdi', '+20 sadoqat, 72 soat');
  return { cost, until: until.toISOString() };
}

/** Sadoqat S: xizmatdagi qo'shin uchun barcha omillar bilan; o'z qo'shini uchun millat bir xil deb olinadi. */
export async function armyLoyalty(t: Tx, armyId: string): Promise<number> {
  const a = await one<{ culture: Culture; owner_kingdom_id: string; serving_kingdom_id: string | null; home_city_id: string; prestige: number | null }>(t, `
    SELECT a.culture, a.owner_kingdom_id, a.serving_kingdom_id, a.home_city_id, c.prestige
    FROM armies a LEFT JOIN commanders c ON c.id = a.commander_id WHERE a.id = $1`, [armyId]);
  if (!a) return 50;
  const units = await unitsOf(t, armyId);
  const total = Math.max(1, totalUnits(units));
  const elite = Math.round(10 * (units['yangicheri'] ?? 0) / total);
  if (!a.serving_kingdom_id) {
    const r = await one<{ food: number; gold: number }>(t, 'SELECT food, gold FROM resources WHERE city_id = $1', [a.home_city_id]);
    return loyaltyScore({ payRatio: (r?.gold ?? 0) > 0 ? 1 : 0, foodRatio: (r?.food ?? 0) > 0 ? 1 : 0, generalPrestige: a.prestige ?? 50,
      relation: 0, sameCulture: true, generosityActive: false, eliteBonus: elite });
  }
  const s = await one<ServiceRow>(t, "SELECT * FROM army_service WHERE army_id = $1 AND state = 'faol'", [armyId]);
  const host = await kingdomById(t, a.serving_kingdom_id);
  const hostFood = await one<{ food: number }>(t, 'SELECT food FROM resources WHERE city_id = $1', [host.capital_city_id]);
  const inputs: LoyaltyInputs = {
    payRatio: !s || s.status !== 'yollanma' || s.owed_total <= 0 ? 1 : s.paid_total / s.owed_total,
    foodRatio: (hostFood?.food ?? 0) > 0 ? 1 : 0,
    generalPrestige: a.prestige ?? 50,
    relation: await getTrust(t, a.owner_kingdom_id, a.serving_kingdom_id),
    sameCulture: a.culture === host.culture,
    generosityActive: !!s?.generosity_until && s.generosity_until.getTime() > Date.now(),
    eliteBonus: elite,
  };
  return loyaltyScore(inputs);
}

/**
 * Jangdan keyin chaqiriladi: W yoki L ni oshiradi va R1-R4, R6 qoidalarini qo'llaydi.
 * R3 (mustaqillik) darhol emas: D-08 bo'yicha 12 soatlik oyna ochiladi (independence_resolve hodisasi).
 */
export async function afterBattle(t: Tx, g: Game, armyId: string, won: boolean, battleId: string) {
  const s = await one<ServiceRow>(t, `UPDATE army_service SET wins = wins + $2, losses = losses + $3, total_wins = total_wins + $2, total_losses = total_losses + $3
    WHERE army_id = $1 AND state = 'faol' RETURNING *`, [armyId, won ? 1 : 0, won ? 0 : 1]);
  if (!s) return null;
  const a = await armyById(t, armyId);
  const host = await kingdomById(t, s.host_kingdom_id);
  const S = await armyLoyalty(t, armyId);
  const units = await unitsOf(t, armyId);
  const out = evaluateServiceLoyalty({ serviceId: s.id, armyCulture: a.culture, hostCulture: host.culture, wins: s.wins, losses: s.losses, soldiers: units, loyalty: S }, battleId);
  const e = out.event;
  if (e.type === 'none') return e;
  await t.query('UPDATE army_service SET wins = $2, losses = $3 WHERE id = $1', [s.id, out.next.wins, out.next.losses]);
  if (e.type === 'desertion') {
    await setUnits(t, armyId, out.next.soldiers);
    const n = Object.values(e.deserted).reduce((x, y) => x + y, 0);
    await t.query(`INSERT INTO rebellions (kingdom_id, army_id, kind, details) VALUES ($1, $2, 'qoshin_tarqalish', $3::jsonb)`,
      [s.owner_kingdom_id, armyId, JSON.stringify({ rule: e.rule, share: e.share, deserted: e.deserted, S })]);
    for (const k of [s.owner_kingdom_id, s.host_kingdom_id]) {
      await notify(t, k, 'sadoqat', `Xizmatdagi qo'shindan ${n} askar tarqab ketdi`, `${e.rule === 'R2' ? 'Mag\'lubiyatlar g\'alabalardan ko\'p' : 'Teng natija, sadoqat past'} (${Math.round(e.share * 100)}%)`);
    }
    if (totalUnits(out.next.soldiers) === 0) await closeService(t, g, s.id, 'qoshin_tarqaldi');
    return e;
  }
  // independence: 12 soatlik oyna (D-08)
  const due = new Date(Date.now() + realDelay(g, 12 * 3_600_000));
  await schedule(t, 'independence_resolve', due, { serviceId: s.id }, `indep:${s.id}`);
  await notify(t, s.host_kingdom_id, 'sadoqat', 'Xizmatdagi qo\'shin mustaqillik talab qilmoqda',
    `12 soat ichida "Saxiylik" bilan sadoqatni oshirishingiz mumkin. Hozirgi urush ehtimoli: ${Math.round(warProbability(S) * 100)}%`, { serviceId: s.id });
  await notify(t, s.owner_kingdom_id, 'sadoqat', 'Qo\'shiningiz g\'alabalardan keyin mustaqillik talab qilmoqda', 'Natija 12 soatdan keyin aniqlanadi');
  return e;
}

/** World Engine: independence_resolve. Roll deterministik: hash(serviceId, 'indep'). */
export async function resolveIndependence(t: Tx, g: Game, p: { serviceId: string }) {
  const s = await one<ServiceRow>(t, "SELECT * FROM army_service WHERE id = $1 AND state = 'faol' FOR UPDATE", [p.serviceId]);
  if (!s) return;
  const S = await armyLoyalty(t, s.army_id);
  const pWar = warProbability(S);
  const roll = rng(`loyalty:${s.id}:indep:${s.total_wins}`)();
  const war = roll < pWar;
  await t.query(`INSERT INTO rebellions (kingdom_id, army_id, kind, details) VALUES ($1, $2, $3, $4::jsonb)`,
    [s.owner_kingdom_id, s.army_id, war ? 'qoshin_urush' : 'qoshin_mustaqillik', JSON.stringify({ S, pWar, roll })]);
  await closeService(t, g, s.id, war ? 'mustaqillik_urush' : 'tinch_mustaqillik');
  if (war) {
    const ends = new Date(Date.now() + realDelay(g, 72 * 3_600_000));
    const d = await one<{ id: string }>(t, `INSERT INTO diplomacy (type, from_kingdom_id, to_kingdom_id, state, duration_hours, starts_at, ends_at, terms)
      VALUES ('urush', $1, $2, 'faol', 72, now(), $3, '{"sabab":"qoshin_qozgoloni"}'::jsonb) RETURNING id`, [s.owner_kingdom_id, s.host_kingdom_id, ends]);
    await schedule(t, 'treaty_expire', ends, { treatyId: d!.id });
    await adjustTrust(t, s.owner_kingdom_id, s.host_kingdom_id, -40);
  }
  for (const k of [s.owner_kingdom_id, s.host_kingdom_id]) {
    await notify(t, k, 'sadoqat', war ? 'Qo\'shin qo\'zg\'olon ko\'tardi: 72 soatlik urush' : 'Qo\'shin tinch yo\'l bilan mustaqil bo\'ldi',
      `Sadoqat ${Math.round(S)}, urush ehtimoli ${Math.round(pWar * 100)}%, natija ${roll.toFixed(3)}`);
  }
}

/** Bitta shartnoma bo'yicha maosh yoki o'lponni hisob-kitob qiladi (oxirgi hisobdan beri). */
export async function settleOne(t: Tx, g: Game, serviceId: string) {
  const s = await one<ServiceRow>(t, 'SELECT * FROM army_service WHERE id = $1 FOR UPDATE', [serviceId]);
  if (!s || !s.last_settled_at) return;
  const now = Date.now();
  const hours = gameMs(g, now - s.last_settled_at.getTime()) / 3_600_000;
  if (hours <= 0) return;
  const hostCap = await capitalOf(t, s.host_kingdom_id);
  const ownerCap = await capitalOf(t, s.owner_kingdom_id);
  if (s.status === 'yollanma' && s.pay_per_hour > 0) {
    const due = s.pay_per_hour * hours;
    await syncCity(t, g, hostCap);
    const got = await take(t, hostCap, { gold: due });
    await syncCity(t, g, ownerCap);
    await credit(t, ownerCap, got);
    const paid = got.gold ?? 0;
    const unpaidSince = paid + 1e-6 < due ? (s.unpaid_since ?? new Date(now)) : null;
    await t.query('UPDATE army_service SET paid_total = paid_total + $2, owed_total = owed_total + $3, unpaid_since = $4, last_settled_at = $5 WHERE id = $1',
      [s.id, paid, due, unpaidSince, new Date(now)]);
  } else if (s.status === 'vassal' && s.tribute_pct > 0) {
    const os = await syncCity(t, g, ownerCap);
    const tribute: Record<string, number> = {};
    for (const [k, v] of Object.entries(os.rates.production)) if (v > 0) tribute[k] = v * hours * s.tribute_pct / 100;
    const got = await take(t, ownerCap, tribute);
    await syncCity(t, g, hostCap);
    await credit(t, hostCap, got);
    await t.query('UPDATE army_service SET last_settled_at = $2 WHERE id = $1', [s.id, new Date(now)]);
  } else {
    await t.query('UPDATE army_service SET last_settled_at = $2 WHERE id = $1', [s.id, new Date(now)]);
  }
}

/** Soatlik: barcha faol shartnomalar; 48 soat maosh to'lanmasa egasiga jarimasiz chiqish huquqi (avtomatik yopiladi). */
export async function settleAll(t: Tx, g: Game) {
  const ids = await many<{ id: string }>(t, "SELECT id FROM army_service WHERE state = 'faol' ORDER BY id LIMIT 5000");
  for (const { id } of ids) {
    await settleOne(t, g, id);
    const s = await one<ServiceRow>(t, 'SELECT * FROM army_service WHERE id = $1', [id]);
    if (s?.unpaid_since && Date.now() - s.unpaid_since.getTime() >= realDelay(g, 48 * 3_600_000)) await closeService(t, g, id, 'maosh_tolanmadi');
  }
}

/** R7: ochlik yoki maoshsizlik -> kuniga 10% * (1 - S/100). Soatlik qo'llanadi (1/24 ulush). */
export async function economicDesertion(t: Tx, _g: Game) {
  const hungry = await many<{ id: string }>(t, `
    SELECT a.id FROM armies a
    JOIN kingdoms k ON k.id = COALESCE(a.serving_kingdom_id, a.owner_kingdom_id)
    JOIN resources r ON r.city_id = CASE WHEN a.serving_kingdom_id IS NULL THEN a.home_city_id ELSE k.capital_city_id END
    WHERE r.food < 1`);
  const unpaid = await many<{ army_id: string }>(t, `SELECT army_id FROM army_service WHERE state = 'faol' AND unpaid_since IS NOT NULL`);
  const ids = new Set([...hungry.map(h => h.id), ...unpaid.map(u => u.army_id)]);
  const hourShare = 1 / 24; // hourly_tick har o'yin soatida ishlaydi
  for (const id of ids) {
    const S = await armyLoyalty(t, id);
    const share = Math.min(0.5, economicDailyDesertShare(S) * hourShare);
    const units = await unitsOf(t, id);
    const next = Object.fromEntries(Object.entries(units).map(([k, n]) => [k, n - Math.floor(n * share)]));
    const lost = totalUnits(units) - totalUnits(next);
    if (lost > 0) {
      await setUnits(t, id, next);
      const a = await armyById(t, id);
      await notify(t, a.owner_kingdom_id, 'sadoqat', `Ochlik/maoshsizlik: ${lost} askar qochdi`, `Sadoqat ${Math.round(S)}`);
    }
  }
}

export async function listServices(t: Tx, me: string) {
  return many(t, `
    SELECT s.*, ko.name AS owner_name, kh.name AS host_name,
      COALESCE((SELECT jsonb_object_agg(unit_key, count) FROM army_units WHERE army_id = s.army_id AND count > 0), '{}'::jsonb) AS units
    FROM army_service s JOIN kingdoms ko ON ko.id = s.owner_kingdom_id JOIN kingdoms kh ON kh.id = s.host_kingdom_id
    WHERE (s.owner_kingdom_id = $1 OR s.host_kingdom_id = $1) AND (s.state IN ('taklif','faol') OR s.created_at > now() - interval '3 days')
    ORDER BY s.created_at DESC LIMIT 50`, [me]);
}

export { computeRates, unitDef };
