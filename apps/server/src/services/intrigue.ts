// apps/server/src/services/intrigue.ts
// Qirolning mehmonligi, agentlar, suiqasd va vorislik. Faqat o'yin ichidagi virtual qahramonlar.

import {
  assassinationEligibility, resolveAssassination, resolveSuccession, rng, targetSecurity, type Heir,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../http/router.js';
import { garrisonOf } from './army.js';
import { capitalOf, syncCity } from './city.js';
import { audit, kingdomById, notify, pushRt, setUnits, spend, totalUnits, unitsOf, type Game } from './common.js';
import { activeTreaty, adjustReputation, adjustTrust } from './diplomacy.js';
import { pickName } from './names.js';

export const AGENT_COST = 400;
export const PREP_RECOMMENDED = 1000;

export async function visit(t: Tx, me: string, cityId: string) {
  const c = await one<{ id: string; kingdom_id: string; is_capital: boolean }>(t, `
    SELECT c.id, c.kingdom_id, (k.capital_city_id = c.id) AS is_capital FROM cities c JOIN kingdoms k ON k.id = c.kingdom_id WHERE c.id = $1`, [cityId]);
  if (!c) throw notFound('Shahar topilmadi');
  if (!c.is_capital) throw bad('not_palace', 'Faqat boshqa qirol saroyiga mehmon bo\'lish mumkin');
  await t.query('UPDATE kingdoms SET king_city_id = $2 WHERE id = $1', [me, cityId]);
  const k = await kingdomById(t, me);
  if (c.kingdom_id !== me) await notify(t, c.kingdom_id, 'mehmon', `${k.ruler_name} (${k.name}) saroyingizga mehmon bo'lib keldi`);
  return { kingCityId: cityId };
}

export async function goHome(t: Tx, me: string) {
  const k = await kingdomById(t, me);
  await t.query('UPDATE kingdoms SET king_city_id = capital_city_id WHERE id = $1', [me]);
  return { kingCityId: k.capital_city_id };
}

export async function hireAgent(t: Tx, g: Game, me: string) {
  const cityId = await capitalOf(t, me);
  const s = await syncCity(t, g, cityId);
  const L = s.level('elchixona');
  if (L < 1) throw conflict('building_required', 'Agent uchun elchixona kerak');
  const n = (await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM agents WHERE kingdom_id = $1 AND state IN ('tayyor','missiyada')", [me]))!.n;
  if (n >= Math.ceil(L / 2)) throw conflict('agent_limit', `Agentlar soni chegarada: ${Math.ceil(L / 2)} (elchixonani yaxshilang)`);
  await spend(t, cityId, { gold: AGENT_COST });
  const k = await kingdomById(t, me);
  const seed = `${me}:${Date.now()}`;
  const skill = Math.min(100, 20 + 6 * L + Math.floor(rng(seed)() * 11));
  const a = await one<{ id: string }>(t, 'INSERT INTO agents (kingdom_id, name, skill) VALUES ($1, $2, $3) RETURNING id', [me, pickName(k.culture, seed), skill]);
  return { agentId: a!.id, skill };
}

/** Vorislik: V1-V4 (game-rules/intrigue.ts) */
export async function applySuccession(t: Tx, kingdomId: string, cause: string) {
  const k = await kingdomById(t, kingdomId, true);
  const heirsRows = await many<{ id: string; name: string; birth_at: Date; order_rank: number; alive: boolean; legitimacy: number }>(t,
    'SELECT * FROM heirs WHERE kingdom_id = $1 AND alive ORDER BY order_rank', [kingdomId]);
  const heirs: Heir[] = heirsRows.map(h => ({ id: h.id, birthMs: h.birth_at.getTime(), orderRank: h.order_rank, alive: h.alive, legitimacy: h.legitimacy }));
  const res = resolveSuccession(heirs, Date.now(), k.noble_loyalty);
  let title = '', body = '';
  if (res.kind === 'crowned' || res.kind === 'regency') {
    const h = heirsRows.find(x => x.id === res.heirId)!;
    await t.query('UPDATE heirs SET alive = false WHERE id = $1', [h.id]);
    await t.query('UPDATE heirs SET order_rank = order_rank - 1 WHERE kingdom_id = $1 AND alive AND order_rank > $2', [kingdomId, h.order_rank]);
    await t.query(`UPDATE kingdoms SET ruler_name = $2, ruler_generation = ruler_generation + 1, regent_until = $3, king_city_id = capital_city_id WHERE id = $1`,
      [kingdomId, h.name, res.kind === 'regency' ? new Date(res.regencyEndsMs) : null]);
    title = res.kind === 'crowned' ? `${h.name} taxtga o'tirdi` : `${h.name} voyaga yetguncha regent boshqaradi`;
    body = `Sabab: ${cause}`;
  } else {
    const name = pickName(k.culture, `${kingdomId}:${Date.now()}:crisis`);
    await t.query(`UPDATE kingdoms SET ruler_name = $2, ruler_generation = ruler_generation + 1, noble_loyalty = 50, king_city_id = capital_city_id, regent_until = NULL WHERE id = $1`, [kingdomId, name]);
    if (res.civilWar) {
      const gid = await garrisonOf(t, k.capital_city_id, true);
      const u = await unitsOf(t, gid);
      const left = Object.fromEntries(Object.entries(u).map(([key, n]) => [key, n - Math.floor(n * 0.3)]));
      await setUnits(t, gid, left);
      await t.query(`INSERT INTO rebellions (kingdom_id, city_id, kind, details) VALUES ($1, $2, 'taxt_uchun', $3::jsonb)`,
        [kingdomId, k.capital_city_id, JSON.stringify({ lost: totalUnits(u) - totalUnits(left), newRuler: name })]);
      title = `Fuqarolar urushi! Yangi hukmdor: ${name}`; body = 'Merosxo\'r yo\'q edi va zodagonlar norozi: garnizonning 30% i da\'vogarga o\'tdi.';
    } else {
      title = `Taxt inqirozi tinch hal bo'ldi. Yangi sulola: ${name}`; body = 'Zodagonlar yangi hukmdorni tanladi.';
    }
  }
  // Yangi hukmdorga yangi merosxo'r (eng kamida bitta bo'lsin)
  const left = (await one<{ n: number }>(t, 'SELECT count(*)::int AS n FROM heirs WHERE kingdom_id = $1 AND alive', [kingdomId]))!.n;
  if (left === 0) {
    const seed = `${kingdomId}:${Date.now()}:heir`;
    await t.query(`INSERT INTO heirs (kingdom_id, name, birth_at, order_rank) VALUES ($1, $2, now() - interval '5 days', 1)`, [kingdomId, pickName(k.culture, seed)]);
  }
  await notify(t, kingdomId, 'vorislik', title, body);
  await pushRt(t, kingdomId, 'kingdom_changed');
  return res;
}

export async function assassinate(t: Tx, g: Game, me: string, input: { targetKingdomId: string; agentId: string; prepGold: number }, ip?: string) {
  const target = await kingdomById(t, input.targetKingdomId, true);
  if (!target.king_city_id) throw conflict('unknown_location', 'Qirolning joylashuvi noma\'lum');
  const last = await one<{ at: Date }>(t, 'SELECT max(created_at) AS at FROM assassinations WHERE organizer_kingdom_id = $1 AND target_kingdom_id = $2', [me, target.id]);
  const err = assassinationEligibility(me, { kingdomId: target.id, ownPalaceCityId: target.capital_city_id, currentCityId: target.king_city_id, alive: true },
    last?.at ? last.at.getTime() : null, Date.now());
  if (err === 'not_guest') throw forbidden('not_guest', 'Qirol o\'z saroyida: unga suiqasd qilib bo\'lmaydi (faqat mehmon bo\'lganda)');
  if (err === 'cooldown') throw conflict('cooldown', 'Bu nishonga 24 soatda bir marta urinish mumkin');
  if (err) throw bad(err, 'Suiqasd mumkin emas');
  const agent = await one<{ id: string; skill: number; state: string }>(t, 'SELECT * FROM agents WHERE id = $1 AND kingdom_id = $2 FOR UPDATE', [input.agentId, me]);
  if (!agent || agent.state !== 'tayyor') throw conflict('agent_busy', 'Agent tayyor emas');
  const myCity = await capitalOf(t, me);
  await syncCity(t, g, myCity);
  if (input.prepGold > 0) await spend(t, myCity, { gold: input.prepGold });

  const host = await one<{ kingdom_id: string }>(t, 'SELECT kingdom_id FROM cities WHERE id = $1', [target.king_city_id]);
  const hostId = host!.kingdom_id;
  const lv = async (city: string, key: string) => (await one<{ level: number }>(t, 'SELECT level FROM buildings WHERE city_id = $1 AND key = $2', [city, key]))?.level ?? 0;
  const escortUnits = totalUnits(await unitsOf(t, await garrisonOf(t, target.capital_city_id)));
  const escort = Math.min(10, Math.floor(escortUnits / 50));
  const guarantee = !!(await activeTreaty(t, hostId, target.id, 'ittifoq'));
  const security = targetSecurity(await lv(target.king_city_id, 'saroy'), escort, guarantee, await lv(target.king_city_id, 'qamoqxona'));
  const prep = Math.min(1, input.prepGold / PREP_RECOMMENDED);
  const attemptId = `${me}:${target.id}:${Date.now()}`;
  const r = resolveAssassination(attemptId, agent.skill, security, prep);

  await t.query(`INSERT INTO assassinations (organizer_kingdom_id, target_kingdom_id, host_city_id, agent_id, prep_gold, security, p_success, success, exposed)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [me, target.id, target.king_city_id, agent.id, input.prepGold, security, r.pSuccess, r.success, r.exposed]);
  await audit(t, { kingdomId: me, action: 'assassination', ip, details: { target: target.id, success: r.success, exposed: r.exposed } });
  const meK = await kingdomById(t, me);

  if (r.success) {
    await notify(t, target.id, 'suiqasd', `Hukmdoringiz ${target.ruler_name} mehmonlikda o'ldirildi`, 'Vorislik boshlandi.');
    await applySuccession(t, target.id, 'suiqasd');
    if (hostId === me) {
      await t.query("UPDATE kingdoms SET guest_killer_until = now() + interval '7 days' WHERE id = $1", [me]);
      await adjustReputation(t, me, -30);
    }
    await notify(t, me, 'suiqasd', `Suiqasd muvaffaqiyatli: ${target.ruler_name}`, 'Agent qaytdi.');
  } else if (r.exposed) {
    await t.query("UPDATE agents SET state = 'asir', captured_by = $2 WHERE id = $1", [agent.id, hostId]);
    await adjustTrust(t, me, target.id, -60);
    if (hostId !== me && hostId !== target.id) await adjustTrust(t, me, hostId, -20);
    await notify(t, target.id, 'suiqasd', `${meK.name} sizga suiqasd uyushtirdi va fosh bo'ldi`, 'Agent asirga olindi.');
    await notify(t, me, 'suiqasd', 'Suiqasd muvaffaqiyatsiz va fosh bo\'ldi', 'Agent asirga tushdi, ishonch -60.');
  } else {
    await notify(t, me, 'suiqasd', 'Suiqasd muvaffaqiyatsiz, lekin sir saqlandi');
  }
  return { success: r.success, exposed: r.exposed, pSuccess: r.pSuccess, security };
}

export async function listIntrigue(t: Tx, me: string) {
  const agents = await many(t, 'SELECT id, name, skill, state FROM agents WHERE kingdom_id = $1 ORDER BY created_at', [me]);
  const heirs = await many(t, `SELECT id, name, order_rank, legitimacy, floor(extract(epoch FROM now() - birth_at) / 86400)::int AS age
    FROM heirs WHERE kingdom_id = $1 AND alive ORDER BY order_rank`, [me]);
  const guests = await many(t, `SELECT k.id, k.name, k.ruler_name, k.culture FROM kingdoms k
    WHERE k.king_city_id = (SELECT capital_city_id FROM kingdoms WHERE id = $1) AND k.id <> $1`, [me]);
  const visiting = await many(t, `SELECT k.id, k.name, k.ruler_name, c.name AS city_name, hk.name AS host_name FROM kingdoms k
    JOIN cities c ON c.id = k.king_city_id JOIN kingdoms hk ON hk.id = c.kingdom_id
    WHERE k.king_city_id IS NOT NULL AND k.king_city_id <> k.capital_city_id AND k.id <> $1 LIMIT 50`, [me]);
  return { agents, heirs, guests, visitingKings: visiting };
}
