// apps/client/src/offline/engine.ts
// OFLAYN REJIM: serversiz o'yin. Server API bilan bir xil shakldagi javoblar qaytaradi, shuning uchun UI o'zgarmaydi.
// Qoidalar serverdagi bilan bir xil: @qirolliklar/game-rules (narx, vaqt, ishlab chiqarish, jang, bozor).
// Holat telefonda saqlanadi (localStorage) va Telegram CloudStorage'ga zaxiralanadi.
// Raqiblar: kompyuter boshqaradigan qirolliklar (NPC). Do'stlar bilan jang: "jang kodi" (offline/duel.ts).

import {
  BASE_UNITS, BUILDINGS, BUILDING_SLOTS, CULTURES, MARKET_BASE_PRICE, MARKET_FEE, MAP_SIZE, RESOURCE_KEYS, SPECIAL_UNITS,
  ZONE_BOUNDS, buildTimeSec, cityTier, computeRates, costAt, cultureZone, marchDurationMs, marketPrice, resolveBattle, rng,
  siegeDamagePerHour, simulateCity, storageCap, terrainAt, unitDef, veterancyFromXp, wallMaxHp, weatherAt, xpGain,
  type BattleArmy, type BuildingKey, type Culture, type ResourceKey, type Resources,
} from '@qirolliklar/game-rules';

export class LocalError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); } }
const bad = (code: string, msg: string, details?: unknown) => new LocalError(400, code, msg, details);
const conflict = (code: string, msg: string) => new LocalError(409, code, msg);

interface Building { id: string; key: BuildingKey; level: number; slot: number }
interface Army { id: string; units: Record<string, number>; xp: number; commanderId: string | null; fromX: number; fromY: number; toX: number; toY: number; departAt: number; arriveAt: number; mission: 'attack' | 'return'; targetId: string | null; loot: Partial<Resources> }
interface Npc { id: string; name: string; ruler: string; culture: Culture; x: number; y: number; tier: number; units: Record<string, number>; stock: Resources; lastRegen: number; shieldUntil: number; wallHp: number }
export interface OState {
  v: 1; speed: number; playerId: string; createdAt: number; seq: number;
  kingdom: null | { id: string; name: string; culture: Culture; rulerName: string; generation: number; reputation: number; nobleLoyalty: number };
  city: null | { id: string; name: string; x: number; y: number; population: number; taxPct: number; happiness: number; wallHp: number; warWeariness: number; lastSim: number; stock: Resources; buildings: Building[] };
  queue: { id: string; buildingId: string; targetLevel: number; cost: Partial<Resources>; finishesAt: number }[];
  recruits: { id: string; unitKey: string; count: number; dueAt: number }[];
  garrison: Record<string, number>; garrisonXp: number;
  armies: Army[];
  commanders: { id: string; name: string; skill: number; prestige: number; wins: number; losses: number }[];
  heirs: { id: string; name: string; birthAt: number; orderRank: number }[];
  npcs: Npc[];
  market: Record<string, { q: number; at: number }>;
  trades: { resource: string; side: string; amount: number; unit_price: number; fee: number; created_at: string }[];
  battles: any[];
  notifications: { id: string; type: string; title: string; body: string; read_at: string | null; created_at: string; data: Record<string, unknown> }[];
  challenges: Record<string, { units: Record<string, number>; xp: number; smithy: number; gskill: number; createdAt: number }>;
  usedCodes: string[];
}

const KEY = 'qrl_offline_v1';
const HOUR = 3_600_000;
const START_RES: Resources = { gold: 1000, food: 1200, wood: 1000, stone: 800, iron: 300, horses: 20 };
const START_BUILDINGS: [BuildingKey, number][] = [['saroy', 1], ['ferma', 1], ['ferma', 1], ['yogoch', 1], ['tosh_kon', 1], ['mahalla', 1], ['ombor', 1], ['kazarma', 1]];
const NPC_NAMES: Record<Culture, string[]> = {
  rus: ['Qayinzor', 'Bo‘rsiqo‘rg‘on', 'Muzdaryo', 'Oqqayin', 'Sovuqtepa'], ingliz: ['Toshqal’a', 'Tumanport', 'Kulranghisor', 'Sherqo‘rg‘on', 'Daryobo‘yi'],
  usmonli: ['Sarvobod', 'Yashilgumbaz', 'Lolazor', 'Oqmasjid', 'Qizilhisor'], temuriy: ['Ko‘kgumbaz', 'Oltinvoha', 'Firuzabod', 'Sardoba', 'Peshtoqli'],
  mogul: ['Ko‘kdasht', 'Oqo‘tov', 'Shamolqir', 'Tug‘obod', 'Chegaraqal’a'],
};
const RULERS: Record<Culture, string[]> = {
  rus: ['Yaropolk', 'Vseslav', 'Ratibor'], ingliz: ['Aldwin', 'Osric', 'Godfrey'], usmonli: ['Kayalp', 'Tolunay', 'Korkut'],
  temuriy: ['Davron', 'Farhod', 'Sherzod'], mogul: ['Temuge', 'Ochirbat', 'Ganzorig'],
};

let S: OState;
let savedHook: ((s: OState) => void) | null = null;
export const onSaved = (f: (s: OState) => void) => { savedHook = f; };

function fresh(): OState {
  return {
    v: 1, speed: 10, playerId: Math.random().toString(36).slice(2, 10), createdAt: Date.now(), seq: 0,
    kingdom: null, city: null, queue: [], recruits: [], garrison: {}, garrisonXp: 0, armies: [], commanders: [], heirs: [], npcs: [],
    market: {}, trades: [], battles: [], notifications: [], challenges: {}, usedCodes: [],
  };
}
export function loadState(raw?: string | null) {
  try { const s = JSON.parse(raw ?? localStorage.getItem(KEY) ?? 'null'); S = s && s.v === 1 ? s : fresh(); } catch { S = fresh(); }
  return S;
}
export function exportState(): string { return JSON.stringify(S); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* xotira to'la */ }
  savedHook?.(S);
}
export function resetState() { S = fresh(); save(); }
export const state = () => S;

const uid = (p: string) => `${p}-${S.playerId}-${(++S.seq).toString(36)}`;
const iso = (t: number) => new Date(t).toISOString();
const realDelay = (gameMs: number) => Math.max(1000, Math.round(gameMs / S.speed));
const sum = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + b, 0);

function notify(type: string, title: string, body = '', data: Record<string, unknown> = {}) {
  S.notifications.unshift({ id: uid('n'), type, title, body, read_at: null, created_at: iso(Date.now()), data });
  S.notifications = S.notifications.slice(0, 100);
  window.dispatchEvent(new CustomEvent('qrl-notify', { detail: { title } }));
}

// ---------------------------------------------------------------- shahar simulyatsiyasi
const lvl = (k: BuildingKey) => S.city!.buildings.filter(b => b.key === k).reduce((m, b) => Math.max(m, b.level), 0);

function upkeep() {
  let food = 0, gold = 0;
  const all = [S.garrison, ...S.armies.map(a => a.units)];
  for (const u of all) for (const [k, n] of Object.entries(u)) {
    const d = unitDef(k);
    food += n * d.foodPerHour;
    gold += n * d.goldPerHour * (1 + CULTURES[S.kingdom!.culture].bonuses.upkeepGold);
  }
  return { food, gold };
}

function econState() {
  const c = S.city!; const up = upkeep();
  return { culture: S.kingdom!.culture, population: c.population, taxPct: c.taxPct, stock: { ...c.stock },
    buildings: c.buildings.filter(b => b.level > 0).map(b => ({ key: b.key, level: b.level })),
    armyFoodPerHour: up.food, armyGoldPerHour: up.gold, warWeariness: c.warWeariness };
}

function simTo(t: number) {
  const c = S.city; if (!c || t <= c.lastSim) return;
  const elapsed = (t - c.lastSim) * S.speed;
  const { state: n, events } = simulateCity(econState(), 0, elapsed);
  const fed = n.stock.food > 0;
  c.population = n.population; c.stock = n.stock; c.lastSim = t;
  c.happiness = Math.round(computeRates(n, fed).happiness);
  c.warWeariness = Math.max(0, c.warWeariness - Math.floor(elapsed / HOUR));
  if (events.some(e => e.type === 'starvation_started')) notify('ochlik', `${c.name}: oziq tugadi`, 'Ferma quring yoki bozordan oziq oling.');
}

function credit(add: Partial<Resources>) {
  const c = S.city!; const oL = lvl('ombor');
  for (const k of RESOURCE_KEYS) c.stock[k] = Math.max(c.stock[k], Math.min(storageCap(oL, k), c.stock[k] + (add[k] ?? 0)));
}
function spend(cost: Partial<Resources>) {
  const c = S.city!;
  const missing: Record<string, number> = {};
  for (const [k, v] of Object.entries(cost) as [ResourceKey, number][]) if (c.stock[k] < v) missing[k] = Math.ceil(v - c.stock[k]);
  if (Object.keys(missing).length) throw bad('not_enough_resources', 'Resurs yetarli emas', { missing });
  for (const [k, v] of Object.entries(cost) as [ResourceKey, number][]) c.stock[k] -= v;
}

// ---------------------------------------------------------------- NPC raqiblar
function npcUnits(cu: Culture, tier: number, growth: number): Record<string, number> {
  const n = Math.round(35 * tier ** 1.7 * growth);
  const u: Record<string, number> = { piyoda: Math.round(n * 0.4), kamonchi: Math.round(n * 0.25), nayzachi: Math.round(n * 0.2) };
  if (tier >= 2) u.otliq = Math.round(n * 0.12);
  if (tier >= 4) u.ogir_otliq = Math.round(n * 0.06);
  if (tier >= 3) { const sp = SPECIAL_UNITS.find(s => s.culture === cu); if (sp) u[sp.key] = Math.round(n * 0.05); }
  return u;
}
const npcGrowth = () => 1 + 0.04 * ((Date.now() - S.createdAt) * S.speed) / (24 * HOUR);

function makeNpcs(px: number, py: number) {
  const r = rng(`npc:${S.playerId}`);
  const out: Npc[] = [];
  for (let i = 0; i < 40 && out.length < 12; i++) {
    const ang = r() * Math.PI * 2, dist = 6 + r() * 26;
    const x = Math.round(px + Math.cos(ang) * dist), y = Math.round(py + Math.sin(ang) * dist);
    if (x < 2 || y < 2 || x > MAP_SIZE - 3 || y > MAP_SIZE - 3) continue;
    const ter = terrainAt(x, y); if (ter === 'daryo' || ter === 'tog') continue;
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < 5)) continue;
    const cu = cultureZone(x, y);
    const tier = Math.min(5, 1 + Math.floor(dist / 7));
    const names = NPC_NAMES[cu];
    const free = names.filter(nm => !out.some(o => o.name.startsWith(nm)));
    const base = (free.length ? free : names)[Math.floor(r() * (free.length || names.length))]!;
    const name = free.length ? base : `${base} ${['II', 'III', 'IV', 'V'][out.filter(o => o.name.startsWith(base)).length - 1] ?? 'VI'}`;
    out.push({ id: uid('npc'), name,
      ruler: RULERS[cu][Math.floor(r() * 3)]!, culture: cu, x, y, tier, units: npcUnits(cu, tier, 1),
      stock: Object.fromEntries(RESOURCE_KEYS.map(k => [k, k === 'horses' ? 20 * tier : 700 * tier])) as Resources,
      lastRegen: Date.now(), shieldUntil: 0, wallHp: tier > 1 ? wallMaxHp(tier - 1, cu) : 0 });
  }
  S.npcs = out;
}

function regenNpc(n: Npc, t: number) {
  const hours = ((t - n.lastRegen) * S.speed) / HOUR;
  if (hours <= 0) return;
  const cap = npcUnits(n.culture, n.tier, npcGrowth());
  const k = Math.min(1, 0.08 * hours);
  for (const [u, c] of Object.entries(cap)) { const cur = n.units[u] ?? 0; n.units[u] = Math.round(cur + Math.max(0, c - cur) * k); }
  for (const r of RESOURCE_KEYS) { const capR = r === 'horses' ? 20 * n.tier : 700 * n.tier * npcGrowth(); n.stock[r] = n.stock[r] + Math.max(0, capR - n.stock[r]) * Math.min(1, 0.05 * hours); }
  if (n.tier > 1) n.wallHp = Math.min(wallMaxHp(n.tier - 1, n.culture), n.wallHp + wallMaxHp(n.tier - 1, n.culture) * Math.min(1, 0.05 * hours));
  n.lastRegen = t;
}

// ---------------------------------------------------------------- hodisalarni vaqt bo'yicha bajarish
function advance(now = Date.now()) {
  if (!S.city) return;
  for (let guard = 0; guard < 500; guard++) {
    const cands: { t: number; run: () => void }[] = [];
    const q = S.queue.slice().sort((a, b) => a.finishesAt - b.finishesAt)[0];
    if (q) cands.push({ t: q.finishesAt, run: () => finishBuild(q.id) });
    const r = S.recruits.slice().sort((a, b) => a.dueAt - b.dueAt)[0];
    if (r) cands.push({ t: r.dueAt, run: () => finishRecruit(r.id) });
    const a = S.armies.slice().sort((x, y) => x.arriveAt - y.arriveAt)[0];
    if (a) cands.push({ t: a.arriveAt, run: () => arrive(a.id, a.arriveAt) });
    const next = cands.filter(c => c.t <= now).sort((x, y) => x.t - y.t)[0];
    if (!next) break;
    simTo(next.t);
    next.run();
  }
  simTo(now);
}

function finishBuild(id: string) {
  const q = S.queue.find(x => x.id === id); if (!q) return;
  S.queue = S.queue.filter(x => x.id !== id);
  const b = S.city!.buildings.find(x => x.id === q.buildingId); if (!b) return;
  b.level = q.targetLevel;
  if (b.key === 'devor') S.city!.wallHp = wallMaxHp(b.level, S.kingdom!.culture);
  notify('qurilish', `Qurilish tugadi: ${b.key} ${b.level}-daraja`);
}
function finishRecruit(id: string) {
  const r = S.recruits.find(x => x.id === id); if (!r) return;
  S.recruits = S.recruits.filter(x => x.id !== id);
  S.garrison[r.unitKey] = (S.garrison[r.unitKey] ?? 0) + r.count;
  notify('yollash', `${r.count} ta ${unitDef(r.unitKey).name} tayyor`);
}

function myBattleArmy(id: string, units: Record<string, number>, xp: number, commanderId: string | null): BattleArmy {
  const cmd = S.commanders.find(c => c.id === commanderId);
  return { armyId: id, culture: S.kingdom!.culture, generalSkill: cmd?.skill ?? 0, loyalty: S.city!.stock.gold > 0 ? 60 : 30, fed: S.city!.stock.food > 0,
    smithyLevel: lvl('temirchilik'), stacks: Object.entries(units).filter(([, n]) => n > 0).map(([unitKey, count]) => ({ unitKey, count, veterancy: veterancyFromXp(xp) })) };
}

function arrive(id: string, t: number) {
  const a = S.armies.find(x => x.id === id); if (!a) return;
  if (a.mission === 'return') {
    for (const [k, n] of Object.entries(a.units)) S.garrison[k] = (S.garrison[k] ?? 0) + n;
    S.garrisonXp = Math.max(S.garrisonXp, a.xp);
    credit(a.loot);
    S.armies = S.armies.filter(x => x.id !== id);
    notify('qaytish', 'Qo‘shin uyga qaytdi', Object.keys(a.loot).length ? `O‘lja: ${Object.entries(a.loot).map(([k, v]) => `${k} ${Math.floor(v ?? 0)}`).join(', ')}` : '');
    return;
  }
  const n = S.npcs.find(x => x.id === a.targetId);
  if (!n) return sendBack(a, t);
  regenNpc(n, t);
  if (n.shieldUntil > t) { notify('jang', `${n.name}: hujum bekor`, 'Shahar qalqon ostida'); return sendBack(a, t); }
  const weather = weatherAt(n.x, n.y, t), terrain = terrainAt(n.x, n.y);
  const att = myBattleArmy(a.id, a.units, a.xp, a.commanderId);
  const wallBefore = Math.round(n.wallHp);
  const wallAfter = Math.max(0, Math.round(wallBefore - siegeDamagePerHour(att.stacks, S.kingdom!.culture, weather)));
  const defId = `def-${n.id}`;
  const def: BattleArmy = { armyId: defId, culture: n.culture, generalSkill: 2 * n.tier, loyalty: 60, fed: true, smithyLevel: n.tier,
    stacks: Object.entries(n.units).filter(([, c]) => c > 0).map(([unitKey, count]) => ({ unitKey, count, veterancy: Math.min(5, n.tier - 1) })) };
  const battleId = uid('b');
  const r = resolveBattle({ battleId, terrain, weather, attackers: [att], defenders: [def],
    fortification: n.tier > 1 ? { wallLevel: n.tier - 1, wallHp: wallAfter, towerLevel: Math.max(0, n.tier - 2) } : undefined });
  const won = r.winner === 'attacker';
  for (const l of r.losses) {
    if (l.armyId === a.id) a.units[l.unitKey] = l.before - l.lost; else n.units[l.unitKey] = l.before - l.lost;
  }
  a.xp += xpGain(won);
  const cmd = S.commanders.find(c => c.id === a.commanderId);
  if (cmd) { if (won) { cmd.skill = Math.min(30, cmd.skill + 1); cmd.prestige = Math.min(100, cmd.prestige + 5); cmd.wins++; } else { cmd.prestige = Math.max(0, cmd.prestige - 8); cmd.losses++; } }
  n.wallHp = wallAfter;
  let loot: Partial<Resources> = {};
  if (won) {
    const carry = Object.entries(a.units).reduce((s, [k, c]) => s + c * unitDef(k).carry, 0);
    const want = Object.fromEntries(RESOURCE_KEYS.map(k => [k, n.stock[k] * 0.3])) as Resources;
    const total = sum(want); const sc = total > carry ? carry / total : 1;
    loot = Object.fromEntries(RESOURCE_KEYS.map(k => [k, Math.floor(want[k] * sc)]));
    for (const k of RESOURCE_KEYS) n.stock[k] -= loot[k] ?? 0;
    for (const [k, v] of Object.entries(loot)) a.loot[k as ResourceKey] = (a.loot[k as ResourceKey] ?? 0) + (v ?? 0);
    n.shieldUntil = t + realDelay(6 * HOUR);
  }
  S.city!.warWeariness = Math.min(30, S.city!.warWeariness + 3);
  const ratio = Number.isFinite(r.ratio) ? Math.min(r.ratio, 999) : 999;
  S.battles.unshift({ id: battleId, occurred_at: iso(t), winner: r.winner, ratio, terrain, weather, loot, wall_hp_before: wallBefore, wall_hp_after: wallAfter,
    attacker_kingdom_id: S.kingdom!.id, attacker_name: S.kingdom!.name, defender_kingdom_id: n.id, defender_name: n.name, city_name: n.name,
    records: r.losses.map(l => ({ side: l.armyId === a.id ? 'attacker' : 'defender', unit: l.unitKey, before: l.before, lost: l.lost, kingdom: l.armyId === a.id ? S.kingdom!.id : n.id })) });
  S.battles = S.battles.slice(0, 50);
  const lostA = r.losses.filter(l => l.armyId === a.id).reduce((s, l) => s + l.lost, 0);
  const lostD = r.losses.filter(l => l.armyId === defId).reduce((s, l) => s + l.lost, 0);
  notify('jang', won ? `G‘alaba: ${n.name}` : `Mag‘lubiyat: ${n.name}`, `Nisbat ${ratio.toFixed(2)}. Siz ${lostA}, dushman ${lostD} askar yo‘qotdi.`);
  sendBack(a, t);
}

function sendBack(a: Army, t: number) {
  if (sum(a.units) === 0) { S.armies = S.armies.filter(x => x.id !== a.id); return; }
  const c = S.city!;
  const fx = a.toX, fy = a.toY;
  a.fromX = fx; a.fromY = fy; a.toX = c.x; a.toY = c.y; a.mission = 'return'; a.targetId = null; a.departAt = t;
  a.arriveAt = t + realDelay(marchDurationMs(Object.keys(a.units).filter(k => a.units[k]! > 0), S.kingdom!.culture, fx, fy, c.x, c.y));
}

// ---------------------------------------------------------------- ko'rinishlar (server bilan bir xil shakl)
function cityView() {
  const c = S.city!; const fed = c.stock.food > 0;
  const rates = computeRates(econState(), fed);
  const tier = cityTier(Math.max(1, lvl('saroy')), c.population);
  const oL = lvl('ombor');
  return {
    id: c.id, name: c.name, x: c.x, y: c.y, population: Math.floor(c.population), populationCap: rates.popCap, taxPct: c.taxPct, happiness: c.happiness, wallHp: c.wallHp,
    tier, slots: BUILDING_SLOTS[tier],
    resources: Object.fromEntries(RESOURCE_KEYS.map(k => [k, Math.floor(c.stock[k])])),
    caps: Object.fromEntries(RESOURCE_KEYS.map(k => [k, storageCap(oL, k)])),
    perHour: Object.fromEntries(RESOURCE_KEYS.map(k => [k, Math.round((rates.production[k] - rates.consumption[k]) * 10) / 10])),
    workerFactor: Math.round(rates.workerFactor * 100) / 100, upkeep: (() => { const u = upkeep(); return { food: Math.round(u.food * 10) / 10, gold: Math.round(u.gold * 10) / 10 }; })(),
    buildings: c.buildings,
  };
}

function armiesView() {
  const k = S.kingdom!;
  const base = { owner_kingdom_id: k.id, serving_kingdom_id: null, owner_name: k.name, serving_name: null, culture: k.culture };
  return [
    { ...base, id: 'garrison', kind: 'garrison', status: 'home', mission: 'none', x: S.city!.x, y: S.city!.y, xp: S.garrisonXp, units: Object.fromEntries(Object.entries(S.garrison).filter(([, n]) => n > 0)) },
    ...S.armies.map(a => ({ ...base, id: a.id, kind: 'field', status: a.mission === 'return' ? 'returning' : 'marching', mission: a.mission, x: a.fromX, y: a.fromY,
      from_x: a.fromX, from_y: a.fromY, to_x: a.toX, to_y: a.toY, depart_at: iso(a.departAt), arrive_at: iso(a.arriveAt), xp: a.xp, target_city_id: a.targetId, units: a.units })),
  ];
}

function me() {
  advance();
  if (!S.kingdom) return { serverTime: iso(Date.now()), gameSpeed: S.speed, kingdom: null, offline: true };
  const k = S.kingdom;
  save();
  return {
    serverTime: iso(Date.now()), gameSpeed: S.speed, offline: true,
    kingdom: { id: k.id, name: k.name, culture: k.culture, rulerName: k.rulerName, generation: k.generation, reputation: k.reputation, nobleLoyalty: k.nobleLoyalty,
      kingCityId: S.city!.id, capitalCityId: S.city!.id, shieldUntil: null, regentUntil: null, traitorUntil: null, guestKillerUntil: null },
    city: cityView(),
    queue: S.queue.map(q => ({ id: q.id, key: S.city!.buildings.find(b => b.id === q.buildingId)?.key, building_id: q.buildingId, target_level: q.targetLevel, finishes_at: iso(q.finishesAt) })),
    recruits: S.recruits.map(r => ({ id: r.id, unit_key: r.unitKey, count: r.count, due_at: iso(r.dueAt) })),
    commanders: S.commanders, armies: armiesView(), services: [],
    intrigue: { agents: [], guests: [], visitingKings: [], heirs: S.heirs.map(h => ({ id: h.id, name: h.name, order_rank: h.orderRank, legitimacy: 50, age: Math.floor((Date.now() - h.birthAt) / (24 * HOUR)) })) },
    unread: S.notifications.filter(n => !n.read_at).length,
  };
}

function worldView() {
  advance();
  const k = S.kingdom!, c = S.city!;
  const now = Date.now();
  const palace = lvl('saroy');
  const cities = [
    { id: c.id, name: c.name, x: c.x, y: c.y, kingdom_id: k.id, kingdom_name: k.name, culture: k.culture, ruler_name: k.rulerName, shielded: false, palace, population: Math.floor(c.population) },
    ...S.npcs.map(n => { regenNpc(n, now); return { id: n.id, name: n.name, x: n.x, y: n.y, kingdom_id: n.id, kingdom_name: `${n.name} beklig`, culture: n.culture, ruler_name: n.ruler, shielded: n.shieldUntil > now, palace: n.tier * 2, population: Math.round(sum(n.units) * 6) }; }),
  ];
  const armies = S.armies.map(a => ({ id: a.id, owner_kingdom_id: k.id, serving_kingdom_id: null, culture: k.culture, status: a.mission === 'return' ? 'returning' : 'marching', mission: a.mission,
    from_x: a.fromX, from_y: a.fromY, to_x: a.toX, to_y: a.toY, depart_at: iso(a.departAt), arrive_at: iso(a.arriveAt) }));
  save();
  return { cities, armies };
}

// ---------------------------------------------------------------- amallar
function createKingdom(b: { name: string; culture: Culture; cityName: string; rulerName?: string }) {
  if (S.kingdom) throw conflict('exists', 'Sizda allaqachon qirollik bor');
  const name = String(b.name ?? '').trim(), cityName = String(b.cityName ?? '').trim();
  if (name.length < 3 || name.length > 32) throw bad('validation', 'Qirollik nomi 3-32 belgi');
  if (cityName.length < 2 || cityName.length > 40) throw bad('validation', 'Poytaxt nomi 2-40 belgi');
  if (!(b.culture in CULTURES)) throw bad('validation', 'Millat noto‘g‘ri');
  const z = ZONE_BOUNDS[b.culture]; const r = rng(`spawn:${S.playerId}`);
  let x = 0, y = 0;
  for (let i = 0; i < 200; i++) {
    x = Math.round(z.x0 + 6 + r() * (z.x1 - z.x0 - 12)); y = Math.round(z.y0 + 6 + r() * (z.y1 - z.y0 - 12));
    const t = terrainAt(x, y); if (t !== 'daryo' && t !== 'tog') break;
  }
  const now = Date.now();
  S.createdAt = now;
  S.kingdom = { id: uid('k'), name, culture: b.culture, rulerName: b.rulerName?.trim() || RULERS[b.culture][0]!, generation: 1, reputation: 0, nobleLoyalty: 60 };
  S.city = { id: uid('c'), name: cityName, x, y, population: 400, taxPct: 15, happiness: 70, wallHp: 0, warWeariness: 0, lastSim: now, stock: { ...START_RES },
    buildings: START_BUILDINGS.map(([key, level], slot) => ({ id: uid('bld'), key, level, slot })) };
  S.garrison = { piyoda: 60, kamonchi: 30, nayzachi: 20 };
  S.commanders = [{ id: uid('g'), name: RULERS[b.culture][1]!, skill: 5, prestige: 50, wins: 0, losses: 0 }];
  S.heirs = [{ id: uid('h'), name: RULERS[b.culture][2]!, birthAt: now - 10 * 24 * HOUR, orderRank: 1 }];
  makeNpcs(x, y);
  notify('xush', 'Xush kelibsiz, hukmdor!', 'Atrofda 12 ta raqib beklik bor. Xaritadan tanlab hujum qiling.');
  save();
  return { kingdomId: S.kingdom.id, cityId: S.city.id, x, y };
}

function build(b: { key?: BuildingKey; buildingId?: string }) {
  advance(); const c = S.city!; const cu = S.kingdom!.culture;
  let bld: Building; let target: number; let isNew = false;
  if (b.buildingId) {
    const f = c.buildings.find(x => x.id === b.buildingId); if (!f) throw new LocalError(404, 'not_found', 'Bino topilmadi');
    if (f.level === 0) throw conflict('under_construction', 'Bino hali qurilmoqda');
    bld = f; target = f.level + 1;
  } else {
    if (!b.key || !(b.key in BUILDINGS)) throw bad('bad_building', 'Noma‘lum bino');
    if (!BUILDINGS[b.key].repeatable && c.buildings.some(x => x.key === b.key)) throw conflict('exists', 'Bu bino allaqachon bor, uni yaxshilang');
    const slots = BUILDING_SLOTS[cityTier(Math.max(1, lvl('saroy')), c.population)];
    if (c.buildings.length >= slots) throw conflict('no_slot', `Bo‘sh joy yo‘q (${slots} ta). Shahar darajasini oshiring`);
    const used = new Set(c.buildings.map(x => x.slot)); let slot = 0; while (used.has(slot)) slot++;
    bld = { id: uid('bld'), key: b.key, level: 0, slot }; target = 1; isNew = true;
  }
  const palace = lvl('saroy');
  if (target > 10) throw conflict('max_level', 'Eng yuqori daraja: 10');
  if (bld.key !== 'saroy' && target > palace) throw conflict('palace_low', `Avval saroyni ${target}-darajaga ko‘taring`);
  if (bld.key === 'saroy' && target >= 2 && lvl('ombor') < target - 1) throw conflict('storage_low', `Saroy ${target} uchun ombor kamida ${target - 1}-daraja bo‘lishi kerak`);
  if (S.queue.some(q => q.buildingId === bld.id)) throw conflict('busy', 'Bu bino allaqachon qurilmoqda');
  const limit = palace >= 5 ? 2 : 1;
  if (S.queue.length >= limit) throw conflict('queue_full', `Qurilish navbati to‘la (${limit} ta)`);
  const cost = costAt(bld.key, target);
  spend(cost);
  if (isNew) c.buildings.push(bld);
  const finishesAt = Date.now() + realDelay(buildTimeSec(bld.key, target, Math.max(1, palace), cu) * 1000);
  const q = { id: uid('q'), buildingId: bld.id, targetLevel: target, cost, finishesAt };
  S.queue.push(q); save();
  return { queueId: q.id, buildingId: bld.id, key: bld.key, targetLevel: target, finishesAt: iso(finishesAt), cost };
}

function cancel(b: { queueId: string }) {
  advance(); const q = S.queue.find(x => x.id === b.queueId); if (!q) throw new LocalError(404, 'not_found', 'Navbat topilmadi');
  S.queue = S.queue.filter(x => x.id !== q.id);
  if (q.targetLevel === 1) S.city!.buildings = S.city!.buildings.filter(x => !(x.id === q.buildingId && x.level === 0));
  const refund = Object.fromEntries(Object.entries(q.cost).map(([k, v]) => [k, Math.floor((v ?? 0) * 0.8)]));
  credit(refund); save();
  return { refunded: refund };
}

const allowedUnits = (c: Culture) => [...Object.keys(BASE_UNITS), ...SPECIAL_UNITS.filter(u => u.culture === c).map(u => u.key)];
function recruit(b: { unitKey: string; count: number }) {
  advance(); const cu = S.kingdom!.culture;
  const count = Math.floor(Number(b.count));
  if (!Number.isFinite(count) || count < 1 || count > 500) throw bad('validation', 'Soni 1-500');
  if (!allowedUnits(cu).includes(b.unitKey)) throw bad('bad_unit', 'Bu birlik sizning millatingizda yo‘q');
  const u = unitDef(b.unitKey); const special = !!u.culture;
  const building = u.cls === 'otliq' || u.cls === 'ogir_otliq' ? (u.key === 'jangovar_fil' ? 'kazarma' : 'otxona') : u.cls === 'qamal' ? 'ustaxona' : 'kazarma';
  const need = special ? 3 : u.cls === 'ogir_otliq' ? 2 : 1;
  const L = lvl(building);
  if (L < need) throw conflict('building_required', `${building} kamida ${need}-daraja bo‘lishi kerak`);
  const mult = 1 + (CULTURES[cu].bonuses.unitCost[u.cls] ?? 0);
  const cost = Object.fromEntries(Object.entries(u.cost).map(([k, v]) => [k, Math.ceil(v * mult * count)]));
  spend(cost);
  const last = S.recruits.reduce((m, r) => Math.max(m, r.dueAt), 0);
  const dueAt = Math.max(Date.now(), last) + realDelay(u.trainSec * 1000 * Math.max(0.55, 1 - 0.05 * (L - 1)) * count);
  S.recruits.push({ id: uid('r'), unitKey: b.unitKey, count, dueAt }); save();
  return { unitKey: b.unitKey, count, readyAt: iso(dueAt), cost };
}

function march(b: { targetCityId: string; units?: Record<string, number>; commanderId?: string }) {
  advance();
  const n = S.npcs.find(x => x.id === b.targetCityId);
  if (!n) throw bad('bad_target', 'Bu shaharga hujum qilib bo‘lmaydi');
  if (n.shieldUntil > Date.now()) throw new LocalError(403, 'shielded', 'Bu beklik qalqon ostida, keyinroq urinib ko‘ring');
  const units = Object.fromEntries(Object.entries(b.units ?? {}).filter(([, c]) => c > 0).map(([k, c]) => [k, Math.floor(c)]));
  if (sum(units) <= 0) throw bad('no_units', 'Kamida bitta askar tanlang');
  for (const [k, c] of Object.entries(units)) if ((S.garrison[k] ?? 0) < c) throw conflict('not_enough_units', `${k}: garnizonda ${S.garrison[k] ?? 0} ta bor`);
  let commanderId: string | null = null;
  if (b.commanderId) {
    if (!S.commanders.some(c => c.id === b.commanderId) || S.armies.some(a => a.commanderId === b.commanderId)) throw conflict('commander_busy', 'General band');
    commanderId = b.commanderId;
  }
  for (const [k, c] of Object.entries(units)) S.garrison[k] = (S.garrison[k] ?? 0) - c;
  const c = S.city!; const now = Date.now();
  const arriveAt = now + realDelay(marchDurationMs(Object.keys(units), S.kingdom!.culture, c.x, c.y, n.x, n.y));
  const a: Army = { id: uid('a'), units, xp: S.garrisonXp, commanderId, fromX: c.x, fromY: c.y, toX: n.x, toY: n.y, departAt: now, arriveAt, mission: 'attack', targetId: n.id, loot: {} };
  S.armies.push(a); save();
  return { armyId: a.id, arriveAt: iso(arriveAt) };
}

function market() {
  advance(); const now = Date.now();
  const prices = Object.fromEntries((Object.keys(MARKET_BASE_PRICE) as (keyof typeof MARKET_BASE_PRICE)[]).map(r => [r, Math.round(marketPrice(MARKET_BASE_PRICE[r], qNow(r, now)) * 1000) / 1000]));
  return { prices, history: S.trades.slice(0, 30) };
}
const qNow = (r: string, now: number) => { const m = S.market[r]; return m ? m.q * Math.exp(-((now - m.at) * S.speed) / (24 * HOUR)) : 0; };
function trade(b: { resource: keyof typeof MARKET_BASE_PRICE; side: 'buy' | 'sell'; amount: number }) {
  advance(); const now = Date.now();
  const amount = Math.floor(Number(b.amount));
  if (!(b.resource in MARKET_BASE_PRICE) || !['buy', 'sell'].includes(b.side) || !(amount >= 1 && amount <= 5000)) throw bad('validation', 'Ma‘lumot noto‘g‘ri');
  const q = qNow(b.resource, now);
  const unit = marketPrice(MARKET_BASE_PRICE[b.resource], q);
  const gross = unit * amount, fee = gross * MARKET_FEE;
  if (b.side === 'buy') {
    const cap = storageCap(lvl('ombor'), b.resource);
    if (S.city!.stock[b.resource] + amount > cap) throw conflict('storage_full', 'Omborda joy yetmaydi');
    spend({ gold: Math.ceil(gross + fee) }); credit({ [b.resource]: amount });
  } else {
    spend({ [b.resource]: amount }); credit({ gold: Math.floor((gross - fee) * (1 + CULTURES[S.kingdom!.culture].bonuses.tradeIncome)) });
  }
  S.market[b.resource] = { q: q + (b.side === 'buy' ? amount : -amount), at: now };
  S.trades.unshift({ resource: b.resource, side: b.side, amount, unit_price: unit, fee, created_at: iso(now) });
  S.trades = S.trades.slice(0, 30); save();
  return { unitPrice: unit, fee: Math.round(fee * 100) / 100 };
}

function kingdomsList(q: string) {
  const w = worldView();
  return w.cities.filter(c => !q || c.kingdom_name.toLowerCase().includes(q.toLowerCase()))
    .map(c => ({ id: c.kingdom_id, name: c.kingdom_name, culture: c.culture, ruler_name: c.ruler_name, reputation: 0, capital_city_id: c.id, x: c.x, y: c.y, population: c.population, palace: c.palace }))
    .sort((a, b) => b.population - a.population);
}

const ONLINE_ONLY = 'Bu imkoniyat faqat onlayn (server) rejimida. Oflaynda do‘stlar bilan “Jang kodi” orqali urushing.';

/** UI chaqiradigan yagona kirish nuqtasi: server API bilan bir xil yo'llar */
export async function localApi(method: string, path: string, body: any): Promise<any> {
  if (!S) loadState();
  const [p, qs] = path.split('?');
  const query = new URLSearchParams(qs ?? '');
  const needKingdom = () => { if (!S.kingdom) throw bad('no_kingdom', 'Avval qirollik yarating'); };
  switch (`${method} ${p}`) {
    case 'GET /api/config': return { mapSize: MAP_SIZE, gameSpeed: S.speed, offline: true, devAuth: false };
    case 'GET /api/me': return me();
    case 'POST /api/kingdom': return createKingdom(body);
    case 'POST /api/city/build': needKingdom(); return build(body);
    case 'POST /api/city/cancel': needKingdom(); return cancel(body);
    case 'POST /api/city/tax': { needKingdom(); advance(); const t = Math.floor(Number(body?.taxPct)); if (!(t >= 0 && t <= 40)) throw bad('validation', '0-40'); S.city!.taxPct = t; save(); return { taxPct: t }; }
    case 'POST /api/army/recruit': needKingdom(); return recruit(body);
    case 'POST /api/army/march': needKingdom(); return march(body);
    case 'GET /api/world': needKingdom(); return worldView();
    case 'GET /api/kingdoms': needKingdom(); return kingdomsList(query.get('q') ?? '');
    case 'GET /api/market': needKingdom(); return market();
    case 'POST /api/market/trade': needKingdom(); return trade(body);
    case 'GET /api/battles': advance(); save(); return S.battles;
    case 'GET /api/notifications': advance(); save(); return S.notifications;
    case 'POST /api/notifications/read': S.notifications.forEach(n => { n.read_at ??= iso(Date.now()); }); save(); return { ok: true };
    case 'GET /api/diplomacy': return { treaties: [], trust: [] };
    case 'POST /api/duel/challenge': needKingdom(); return (await import('./duel.js')).createChallenge(body);
    case 'POST /api/duel/accept': needKingdom(); return (await import('./duel.js')).acceptChallenge(body);
    case 'POST /api/duel/result': needKingdom(); return (await import('./duel.js')).applyResult(body);
    case 'POST /api/offline/speed': { const v = Number(body?.speed); if (![1, 5, 10, 30, 60].includes(v)) throw bad('validation', 'Tezlik 1, 5, 10, 30 yoki 60'); advance(); if (S.city) S.city.lastSim = Date.now(); S.speed = v; save(); return { speed: v }; }
    case 'POST /api/offline/reset': resetState(); return { ok: true };
  }
  if (method === 'GET' && p!.startsWith('/api/kingdoms/')) return { trust: null };
  throw new LocalError(400, 'online_only', ONLINE_ONLY);
}

// duel.ts uchun ichki yordamchilar
export const internals = { advance, save, notify, uid, myBattleArmy, lvl, credit, iso };
