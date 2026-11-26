// apps/server/src/services/kingdom.ts
// Qirollik yaratish (onboarding), "men" ko'rinishi, dunyo xaritasi, reyting, tarix va xabarlar.

import { ZONE_BOUNDS, regionId, regionOf, rng, terrainAt, type Culture } from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { bad, conflict, notFound } from '../http/router.js';
import { listArmies } from './army.js';
import { cityView, syncCity } from './city.js';
import { kingdomById, realDelay, type Game } from './common.js';
import { getTrust } from './diplomacy.js';
import { listIntrigue } from './intrigue.js';
import { pickName } from './names.js';
import { listServices } from './service.js';

const START_RES = { gold: 1000, food: 1200, wood: 1000, stone: 800, iron: 300, horses: 20 };
const START_BUILDINGS: [string, number][] = [['saroy', 1], ['ferma', 1], ['ferma', 1], ['yogoch', 1], ['tosh_kon', 1], ['mahalla', 1], ['ombor', 1], ['kazarma', 1]];

async function findSpawn(t: Tx, culture: Culture, seed: string): Promise<{ x: number; y: number }> {
  const b = ZONE_BOUNDS[culture];
  const r = rng(seed);
  for (let i = 0; i < 400; i++) {
    const x = b.x0 + Math.floor(r() * (b.x1 - b.x0 + 1));
    const y = b.y0 + Math.floor(r() * (b.y1 - b.y0 + 1));
    const ter = terrainAt(x, y);
    if (ter === 'daryo' || ter === 'tog') continue;
    const near = await one(t, 'SELECT 1 FROM cities WHERE abs(x - $1) < 6 AND abs(y - $2) < 6 LIMIT 1', [x, y]);
    if (!near) return { x, y };
  }
  throw conflict('zone_full', 'Bu millat hududida bo\'sh joy qolmadi, boshqa millatni tanlang');
}

export async function createKingdom(t: Tx, g: Game, userId: string, input: { name: string; culture: Culture; cityName: string; rulerName?: string }) {
  if (await one(t, 'SELECT 1 FROM kingdoms WHERE user_id = $1', [userId])) throw conflict('exists', 'Sizda allaqachon qirollik bor');
  if (await one(t, 'SELECT 1 FROM kingdoms WHERE lower(name) = lower($1)', [input.name])) throw conflict('name_taken', 'Bu nom band');
  const seed = `${userId}:${input.name}`;
  const { x, y } = await findSpawn(t, input.culture, seed);
  const ruler = input.rulerName?.trim() || pickName(input.culture, seed + ':ruler');
  const shield = g.shieldHours > 0 ? new Date(Date.now() + realDelay(g, g.shieldHours * 3_600_000)) : null;
  const k = await one<{ id: string }>(t, `INSERT INTO kingdoms (user_id, name, culture, ruler_name, shield_until) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, input.name, input.culture, ruler, shield]);
  const kid = k!.id;
  // Boshlang'ich balans: aholi 400, soliq 15% -> oltin taxminan +27/soat (garnizon maoshi 36/soat dan keyin)
  const c = await one<{ id: string }>(t, 'INSERT INTO cities (kingdom_id, name, x, y, population, tax_pct) VALUES ($1, $2, $3, $4, 400, 15) RETURNING id', [kid, input.cityName, x, y]);
  const cid = c!.id;
  await t.query('UPDATE kingdoms SET capital_city_id = $2, king_city_id = $2 WHERE id = $1', [kid, cid]);
  await t.query('INSERT INTO resources (city_id, gold, food, wood, stone, iron, horses) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [cid, START_RES.gold, START_RES.food, START_RES.wood, START_RES.stone, START_RES.iron, START_RES.horses]);
  for (const [i, [key, level]] of START_BUILDINGS.entries()) await t.query('INSERT INTO buildings (city_id, key, level, slot) VALUES ($1, $2, $3, $4)', [cid, key, level, i]);
  const gar = await one<{ id: string }>(t, `INSERT INTO armies (owner_kingdom_id, home_city_id, culture, kind, status, x, y) VALUES ($1, $2, $3, 'garrison', 'home', $4, $5) RETURNING id`,
    [kid, cid, input.culture, x, y]);
  await t.query("INSERT INTO army_units (army_id, unit_key, count) VALUES ($1, 'piyoda', 60), ($1, 'kamonchi', 30), ($1, 'nayzachi', 20)", [gar!.id]);
  await t.query('INSERT INTO commanders (kingdom_id, name, skill) VALUES ($1, $2, 5)', [kid, pickName(input.culture, seed + ':gen')]);
  const r = rng(seed + ':heirs');
  for (let i = 1; i <= 2; i++) {
    const age = 8 + Math.floor(r() * 7);
    await t.query(`INSERT INTO heirs (kingdom_id, name, birth_at, order_rank) VALUES ($1, $2, now() - make_interval(days => $3), $4)`,
      [kid, pickName(input.culture, `${seed}:heir${i}`, r() < 0.4), age, i]);
  }
  const { rx, ry } = regionOf(x, y);
  await t.query('UPDATE territories SET owner_kingdom_id = $2, controlled_since = now() WHERE id = $1 AND owner_kingdom_id IS NULL', [regionId(rx, ry), kid]);
  return { kingdomId: kid, cityId: cid, x, y };
}

export async function meView(t: Tx, g: Game, userId: string) {
  const user = await one(t, 'SELECT id, telegram_id::text AS telegram_id, username, first_name FROM users WHERE id = $1', [userId]);
  const k = await one<{ id: string }>(t, 'SELECT id FROM kingdoms WHERE user_id = $1', [userId]);
  if (!k) return { user, kingdom: null };
  const kingdom = await kingdomById(t, k.id);
  const s = await syncCity(t, g, kingdom.capital_city_id);
  const queue = await many(t, `SELECT q.id, q.target_level, q.finishes_at, b.key, b.id AS building_id FROM construction_queue q JOIN buildings b ON b.id = q.building_id
    WHERE q.city_id = $1 AND q.state = 'active' ORDER BY q.finishes_at`, [s.city.id]);
  const recruits = await many(t, `SELECT id::text AS id, due_at, payload->>'unitKey' AS unit_key, (payload->>'count')::int AS count FROM game_events
    WHERE type = 'recruit_complete' AND state = 'pending' AND payload->>'cityId' = $1 ORDER BY due_at`, [s.city.id]);
  const commanders = await many(t, 'SELECT id, name, skill, prestige, wins, losses FROM commanders WHERE kingdom_id = $1 AND alive', [k.id]);
  const unread = (await one<{ n: number }>(t, 'SELECT count(*)::int AS n FROM notifications WHERE kingdom_id = $1 AND read_at IS NULL', [k.id]))!.n;
  return {
    user, serverTime: new Date().toISOString(), gameSpeed: g.speed,
    kingdom: {
      id: kingdom.id, name: kingdom.name, culture: kingdom.culture, rulerName: kingdom.ruler_name, generation: kingdom.ruler_generation,
      reputation: kingdom.reputation, nobleLoyalty: kingdom.noble_loyalty, kingCityId: kingdom.king_city_id, capitalCityId: kingdom.capital_city_id,
      shieldUntil: kingdom.shield_until, regentUntil: kingdom.regent_until, traitorUntil: kingdom.traitor_until, guestKillerUntil: kingdom.guest_killer_until,
    },
    city: cityView(s), queue, recruits, commanders,
    armies: await listArmies(t, k.id),
    services: await listServices(t, k.id),
    intrigue: await listIntrigue(t, k.id),
    unread,
  };
}

export async function world(t: Tx, x0: number, y0: number, x1: number, y1: number) {
  if (x1 - x0 > 128 || y1 - y0 > 128 || x1 < x0 || y1 < y0) throw bad('bad_box', 'Maydon juda katta');
  const cities = await many(t, `
    SELECT c.id, c.name, c.x, c.y, c.kingdom_id, k.name AS kingdom_name, k.culture, k.ruler_name,
      (k.shield_until IS NOT NULL AND k.shield_until > now()) AS shielded,
      COALESCE((SELECT level FROM buildings b WHERE b.city_id = c.id AND b.key = 'saroy'), 1) AS palace,
      floor(c.population)::int AS population
    FROM cities c JOIN kingdoms k ON k.id = c.kingdom_id
    WHERE c.x BETWEEN $1 AND $3 AND c.y BETWEEN $2 AND $4 LIMIT 2000`, [x0, y0, x1, y1]);
  const armies = await many(t, `
    SELECT a.id, a.owner_kingdom_id, a.serving_kingdom_id, a.culture, a.status, a.mission, a.from_x, a.from_y, a.to_x, a.to_y, a.depart_at, a.arrive_at, a.x, a.y
    FROM armies a WHERE a.status IN ('marching','returning') AND
      ((a.from_x BETWEEN $1 AND $3 AND a.from_y BETWEEN $2 AND $4) OR (a.to_x BETWEEN $1 AND $3 AND a.to_y BETWEEN $2 AND $4)) LIMIT 2000`, [x0, y0, x1, y1]);
  return { cities, armies };
}

export async function kingdoms(t: Tx, q: string) {
  return many(t, `
    SELECT k.id, k.name, k.culture, k.ruler_name, k.reputation, c.id AS capital_city_id, c.x, c.y, floor(c.population)::int AS population,
      COALESCE((SELECT level FROM buildings b WHERE b.city_id = c.id AND b.key = 'saroy'), 1) AS palace
    FROM kingdoms k JOIN cities c ON c.id = k.capital_city_id
    WHERE ($1 = '' OR k.name ILIKE '%' || $1 || '%')
    ORDER BY c.population DESC LIMIT 100`, [q]);
}

export async function kingdomPublic(t: Tx, me: string | undefined, id: string) {
  const k = await one(t, `SELECT k.id, k.name, k.culture, k.ruler_name, k.ruler_generation, k.reputation, k.capital_city_id, k.king_city_id,
      (k.shield_until > now()) AS shielded, (k.traitor_until > now()) AS traitor, (k.guest_killer_until > now()) AS guest_killer,
      c.name AS capital_name, c.x, c.y, floor(c.population)::int AS population
    FROM kingdoms k JOIN cities c ON c.id = k.capital_city_id WHERE k.id = $1`, [id]);
  if (!k) throw notFound('Qirollik topilmadi');
  return { ...k, trust: me && me !== id ? await getTrust(t, me, id) : null };
}

export async function battles(t: Tx, me: string) {
  return many(t, `
    SELECT b.id, b.occurred_at, b.winner, b.ratio, b.terrain, b.weather, b.loot, b.wall_hp_before, b.wall_hp_after,
      b.attacker_kingdom_id, ka.name AS attacker_name, b.defender_kingdom_id, kd.name AS defender_name, ka.culture AS attacker_culture, kd.culture AS defender_culture, c.name AS city_name,
      (SELECT jsonb_agg(jsonb_build_object('side', r.side, 'unit', r.unit_key, 'before', r.before, 'lost', r.lost, 'kingdom', r.kingdom_id))
         FROM battle_records r WHERE r.battle_id = b.id) AS records
    FROM battles b LEFT JOIN kingdoms ka ON ka.id = b.attacker_kingdom_id LEFT JOIN kingdoms kd ON kd.id = b.defender_kingdom_id
    LEFT JOIN cities c ON c.id = b.target_city_id
    WHERE b.attacker_kingdom_id = $1 OR b.defender_kingdom_id = $1
       OR EXISTS (SELECT 1 FROM battle_records r WHERE r.battle_id = b.id AND r.kingdom_id = $1)
    ORDER BY b.occurred_at DESC LIMIT 50`, [me]);
}

export async function notifications(t: Tx, me: string) {
  return many(t, 'SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE kingdom_id = $1 ORDER BY created_at DESC LIMIT 100', [me]);
}
