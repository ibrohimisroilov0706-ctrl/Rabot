// apps/client/src/lord/world.ts
// Global xarita simulyatsiyasi: lordlar, qaroqchilar, qishloq/qal'a/shaharlar, urush-tinchlik, iqtisod.
// Vaqt faqat o'yinchi yurganda yoki "kutish" yoqilganda o'tadi (Mount&Blade uslubi). DOM yo'q.

import { MAP_SIZE, TERRAIN_MOVE, ZONE_BOUNDS, hashSeed, terrainAt, type Culture } from '@qirolliklar/game-rules';
import {
  BANDIT_KINDS, CULTURE_LIST, FACTIONS, KING_TITLE, LORD_NAMES, LORD_TITLE, SET_NAMES, groupOf, mercCost, troop, troopPower, upgradeCost, xpNeed,
  type FacId,
} from './data.js';

export interface Stack { id: string; n: number; xp: number; w: number }
export type Goal = { kind: 'pt'; x: number; y: number } | { kind: 'set'; id: string } | { kind: 'party'; id: string };
export type Mode = 'idle' | 'patrol' | 'chase' | 'flee' | 'raid' | 'siege' | 'home';
export interface Party {
  id: string; kind: 'player' | 'lord' | 'bandit'; name: string; fac: FacId; cu: Culture;
  x: number; y: number; goal: Goal | null; troops: Stack[]; gold: number;
  mode: Mode; modeT: number; home?: string; king?: boolean; down?: number; busy?: number;
}
export interface Sett {
  id: string; name: string; kind: 'town' | 'castle' | 'village'; x: number; y: number; cu: Culture;
  fac: FacId; owner: string | null; garrison: Stack[]; vol: number; prosper: number; looted: number;
  bound?: string; siegeBy?: string; siegeT?: number; merc?: { id: string; n: number };
}
export interface Player {
  name: string; cu: Culture; renown: number; level: number; xp: number; food: number;
  liege: FacId | null; kills: number; wins: number; losses: number; prisoners: Stack[];
}
export interface World {
  v: 2; seed: string; rs: number; t: number; speed: number; waiting: boolean;
  player: Player; parties: Party[]; sets: Sett[];
  wars: string[]; warSince: Record<string, number>; rel: Record<string, number>;
  log: { t: number; text: string }[]; nid: number; day: number; used: string[]; tutorial: number;
}
export type WEvent =
  | { k: 'meet'; id: string } | { k: 'enter'; id: string } | { k: 'attacked'; id: string }
  | { k: 'news'; text: string; important?: boolean };

export const HOURS_PER_SEC = 0.55;

// ---------------------------------------------------------------- yordamchilar
export function rand(w: World): number {
  w.rs = (w.rs + 0x6d2b79f5) >>> 0;
  let t = w.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(w: World, a: T[]): T => a[Math.floor(rand(w) * a.length)]!;
const uid = (w: World, p: string) => `${p}${(w.nid++).toString(36)}`;
export const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
export const count = (s: Stack[]) => s.reduce((a, b) => a + b.n, 0);
export const healthy = (s: Stack[]) => s.reduce((a, b) => a + b.n - b.w, 0);
export const power = (s: Stack[], healthyOnly = true) => s.reduce((a, b) => a + (healthyOnly ? b.n - b.w : b.n) * troopPower(b.id), 0);
export const player = (w: World) => w.parties.find(p => p.kind === 'player')!;
export const setById = (w: World, id: string) => w.sets.find(s => s.id === id);
export const partyById = (w: World, id: string) => w.parties.find(p => p.id === id);
export const dayOf = (w: World) => Math.floor(w.t / 24) + 1;

export function addTroops(s: Stack[], id: string, n: number, xp = 0) {
  if (n <= 0) return;
  const st = s.find(x => x.id === id);
  if (st) { st.n += n; st.xp += xp; } else s.push({ id, n, xp, w: 0 });
  s.sort((a, b) => troop(b.id).tier - troop(a.id).tier);
}
/** Kuchli guruhlardan boshlab emas, tasodifan n ta askar olib tashlaydi (yoki yaradorga aylantiradi) */
export function takeRandom(w: World, s: Stack[], n: number, wound = 0) {
  for (let i = 0; i < n; i++) {
    const total = healthy(s); if (total <= 0) break;
    let r = rand(w) * total;
    for (const st of s) { const hn = st.n - st.w; if (r < hn) { if (rand(w) < wound) st.w++; else st.n--; break; } r -= hn; }
  }
  for (let i = s.length - 1; i >= 0; i--) if (s[i]!.n <= 0) s.splice(i, 1);
}
export function applyLosses(s: Stack[], lost: Record<string, number>, woundShare: number, w: World) {
  for (const [id, n] of Object.entries(lost)) {
    const st = s.find(x => x.id === id); if (!st) continue;
    for (let i = 0; i < n; i++) { if (st.n - st.w <= 0) break; if (rand(w) < woundShare) st.w++; else st.n--; }
  }
  for (let i = s.length - 1; i >= 0; i--) if (s[i]!.n <= 0) s.splice(i, 1);
}

export function news(w: World, text: string) { w.log.unshift({ t: w.t, text }); w.log = w.log.slice(0, 80); }

// ---------------------------------------------------------------- urush/tinchlik
const key = (a: FacId, b: FacId) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const facOfParty = (w: World, p: Party): FacId => (p.kind === 'player' ? w.player.liege ?? 'player' : p.fac);
export const playerFac = (w: World): FacId => w.player.liege ?? 'player';
export function atWar(w: World, a: FacId, b: FacId) {
  if (a === b) return false;
  if (a === 'bandit' || b === 'bandit') return true;
  return w.wars.includes(key(a, b));
}
export function declareWar(w: World, a: FacId, b: FacId) {
  if (a === b || a === 'bandit' || b === 'bandit' || atWar(w, a, b)) return;
  w.wars.push(key(a, b)); w.warSince[key(a, b)] = w.t;
  news(w, `⚔ ${FACTIONS[a].name} va ${FACTIONS[b].name} o'rtasida urush boshlandi!`);
}
export function makePeace(w: World, a: FacId, b: FacId) {
  const k = key(a, b); if (!w.wars.includes(k)) return;
  w.wars = w.wars.filter(x => x !== k); delete w.warSince[k];
  news(w, `🕊 ${FACTIONS[a].name} va ${FACTIONS[b].name} sulh tuzdi.`);
}
export const hostile = (w: World, a: Party, b: Party) => atWar(w, facOfParty(w, a), facOfParty(w, b));

// ---------------------------------------------------------------- o'yinchi
export const maxParty = (w: World) => 22 + Math.floor(w.player.renown / 6) + w.player.level * 3;
export function weeklyWages(w: World): number {
  let g = player(w).troops.reduce((a, s) => a + s.n * troop(s.id).wage, 0);
  for (const s of w.sets) if (s.owner === 'player') g += Math.ceil(s.garrison.reduce((a, st) => a + st.n * troop(st.id).wage, 0) * 0.5);
  return g;
}
export function weeklyIncome(w: World, owner: string): number {
  let g = 0;
  for (const s of w.sets) if (s.owner === owner) g += fiefIncome(w, s);
  return g;
}
export const fiefIncome = (w: World, s: Sett) => Math.round((s.kind === 'town' ? 420 : s.kind === 'castle' ? 160 : 90) * s.prosper * (s.looted > w.t ? 0.2 : 1));
export const levelXp = (lvl: number) => 80 + lvl * 70;

// ---------------------------------------------------------------- dunyo yaratish
const landOk = (x: number, y: number) => { const t = terrainAt(Math.floor(x), Math.floor(y)); return t !== 'daryo' && t !== 'tog'; };

export function newWorld(name: string, cu: Culture, seed = `${Date.now()}`): World {
  const w: World = {
    v: 2, seed, rs: hashSeed(`lord:${seed}`), t: 8, speed: 1, waiting: false,
    player: { name, cu, renown: 5, level: 1, xp: 0, food: 40, liege: null, kills: 0, wins: 0, losses: 0, prisoners: [] },
    parties: [], sets: [], wars: [], warSince: {}, rel: {}, log: [], nid: 1, day: 1, used: [], tutorial: 0,
  };
  for (const c of CULTURE_LIST) {
    const b = ZONE_BOUNDS[c]; const majors: Sett[] = [];
    const kinds: ('town' | 'castle')[] = ['town', 'town', 'town', 'castle', 'castle', 'castle'];
    let minD = 10;
    for (let i = 0; i < kinds.length; i++) {
      let placed = false;
      for (let tries = 0; tries < 400 && !placed; tries++) {
        if (tries === 200) minD = 6;
        const x = b.x0 + 3 + rand(w) * (b.x1 - b.x0 - 6), y = b.y0 + 3 + rand(w) * (b.y1 - b.y0 - 6);
        if (!landOk(x, y) || majors.some(m => d2(m, { x, y }) < minD)) continue;
        const nm = SET_NAMES[c][kinds[i]!][kinds[i] === 'town' ? i : i - 3]!;
        majors.push({ id: uid(w, 's'), name: nm, kind: kinds[i]!, x, y, cu: c, fac: c, owner: null, garrison: [], vol: 0, prosper: 0.8 + rand(w) * 0.4, looted: 0 });
        placed = true;
      }
    }
    let vi = 0;
    for (const m of majors) {
      for (let k = 0; k < 2; k++) {
        for (let tries = 0; tries < 300; tries++) {
          const a = rand(w) * Math.PI * 2, r = 3 + rand(w) * 3.5;
          const x = Math.min(MAP_SIZE - 2, Math.max(2, m.x + Math.cos(a) * r)), y = Math.min(MAP_SIZE - 2, Math.max(2, m.y + Math.sin(a) * r));
          if (!landOk(x, y) || [...majors, ...w.sets].some(s => d2(s, { x, y }) < 2.6)) continue;
          w.sets.push({ id: uid(w, 's'), name: SET_NAMES[c].village[vi++ % 12]!, kind: 'village', x, y, cu: c, fac: c, owner: null, garrison: [], vol: 6, prosper: 0.8 + rand(w) * 0.4, looted: 0, bound: m.id });
          break;
        }
      }
    }
    w.sets.push(...majors);
    // lordlar
    const names = LORD_NAMES[c].slice();
    for (let i = 0; i < 5; i++) {
      const home = majors[i % majors.length]!;
      const king = i === 0;
      const p: Party = {
        id: uid(w, 'l'), kind: 'lord', name: `${king ? KING_TITLE[c] : LORD_TITLE[c]} ${names[i]}`, fac: c, cu: c,
        x: home.x + 0.8, y: home.y + 0.6, goal: null, troops: [], gold: 800, mode: 'idle', modeT: rand(w) * 3, home: home.id, king,
      };
      fillLordTroops(w, p, king ? 85 : 55);
      w.parties.push(p);
      home.owner = p.id;
    }
    majors[5] && (majors[5].owner = w.parties.find(p => p.fac === c && p.king)!.id);
    for (const m of majors) {
      fillGarrison(w, m, m.kind === 'town' ? 60 : 40);
      m.merc = { id: `${pick(w, CULTURE_LIST)}_${pick(w, ['inf3', 'arc3', 'cav3', 'spr3'])}`, n: 4 + Math.floor(rand(w) * 6) };
    }
    for (const v of w.sets) if (v.kind === 'village' && v.cu === c) v.owner = setById(w, v.bound!)?.owner ?? null;
  }
  // boshlang'ich urushlar
  declareWar(w, 'rus', 'mogul'); declareWar(w, 'usmonli', 'temuriy'); declareWar(w, 'ingliz', 'usmonli');
  w.log = [];
  for (let i = 0; i < 12; i++) spawnBandit(w);
  // o'yinchi
  const start = w.sets.find(s => s.kind === 'town' && s.cu === cu)!;
  const p: Party = { id: 'player', kind: 'player', name, fac: 'player', cu, x: start.x + 1.2, y: start.y + 0.9, goal: null, troops: [], gold: 650, mode: 'idle', modeT: 0 };
  addTroops(p.troops, `${cu}_t1`, 9); addTroops(p.troops, `${cu}_inf2`, 4); addTroops(p.troops, `${cu}_arc2`, 3);
  w.parties.push(p);
  news(w, `👑 ${name} o'z yo'lini boshladi. Qishloqlardan askar yollang, qaroqchilarni yenging va yer egasi bo'ling.`);
  return w;
}

function fillLordTroops(w: World, p: Party, target: number) {
  const c = p.cu; const have = count(p.troops);
  const mix: [string, number][] = [['t1', 0.18], ['inf2', 0.2], ['arc2', 0.16], ['spr3', 0.1], ['inf3', 0.1], ['arc3', 0.1], ['cav3', 0.1], ['cav4', 0.06]];
  for (let i = have; i < target; i++) {
    let r = rand(w); let id = `${c}_t1`;
    for (const [k, f] of mix) { if (r < f) { id = `${c}_${k}`; break; } r -= f; }
    addTroops(p.troops, id, 1);
  }
  if (c === 'temuriy' && p.king && !p.troops.some(s => s.id === 'temuriy_elf5')) addTroops(p.troops, 'temuriy_elf5', 2);
}
function fillGarrison(w: World, s: Sett, target: number) {
  const c = s.cu; const mix: [string, number][] = [['t1', 0.25], ['inf2', 0.25], ['arc2', 0.2], ['spr3', 0.1], ['arc3', 0.1], ['inf3', 0.1]];
  for (let i = count(s.garrison); i < target; i++) {
    let r = rand(w); let id = `${c}_t1`;
    for (const [k, f] of mix) { if (r < f) { id = `${c}_${k}`; break; } r -= f; }
    addTroops(s.garrison, id, 1);
  }
}

export function spawnBandit(w: World) {
  for (let tries = 0; tries < 60; tries++) {
    const x = 4 + rand(w) * (MAP_SIZE - 8), y = 4 + rand(w) * (MAP_SIZE - 8);
    if (!landOk(x, y) || w.sets.some(s => s.kind !== 'village' && d2(s, { x, y }) < 5)) continue;
    const z = (Object.keys(ZONE_BOUNDS) as Culture[]).find(c => { const b = ZONE_BOUNDS[c]; return x >= b.x0 - 3 && x <= b.x1 + 3 && y >= b.y0 - 3 && y <= b.y1 + 3; }) ?? 'temuriy';
    const kind = pick(w, BANDIT_KINDS);
    const p: Party = { id: uid(w, 'b'), kind: 'bandit', name: kind.name, fac: 'bandit', cu: z, x, y, goal: null, troops: [], gold: 60 + Math.floor(rand(w) * 120), mode: 'idle', modeT: 0 };
    const k = 0.7 + rand(w) * 0.9;
    for (const [id, n] of kind.troops(z)) addTroops(p.troops, id, Math.max(1, Math.round(n * k)));
    w.parties.push(p);
    return p;
  }
  return null;
}

// ---------------------------------------------------------------- harakat
export function speedOf(w: World, p: Party): number {
  const n = Math.max(1, count(p.troops));
  const cav = p.troops.reduce((a, s) => a + (groupOf(troop(s.id).cls) === 'cav' ? s.n : 0), 0) / n;
  const ter = terrainAt(Math.floor(p.x), Math.floor(p.y));
  let base = 5.2 + cav * 2.2 - Math.min(2.2, n / 55);
  if (p.kind === 'bandit') base += 0.4;
  if (p.kind === 'player' && w.player.food <= 0) base *= 0.8;
  return Math.max(2.2, base * TERRAIN_MOVE[ter]);
}
function goalPoint(w: World, g: Goal): { x: number; y: number } | null {
  if (g.kind === 'pt') return g;
  if (g.kind === 'set') return setById(w, g.id) ?? null;
  const p = partyById(w, g.id); return p && !p.down ? p : null;
}

// ---------------------------------------------------------------- avto-jang (AI vs AI)
export function autoResolve(w: World, a: Stack[], b: Stack[], kb = 1): 0 | 1 {
  const pa = power(a) * (0.8 + rand(w) * 0.4), pb = power(b) * kb * (0.8 + rand(w) * 0.4);
  const win: 0 | 1 = pa >= pb ? 0 : 1;
  const ratio = Math.min(pa, pb) / Math.max(1, Math.max(pa, pb));
  const [W, L] = win === 0 ? [a, b] : [b, a];
  takeRandom(w, W, Math.round(healthy(W) * (0.1 + 0.35 * ratio)), 0.5);
  takeRandom(w, L, Math.round(healthy(L) * (0.55 + 0.3 * rand(w))), 0.3);
  return win;
}

function routLord(w: World, p: Party, by: string) {
  p.down = w.t + 36 + rand(w) * 24; p.goal = null; p.mode = 'idle';
  for (const s of w.sets) if (s.siegeBy === p.id) { s.siegeBy = undefined; s.siegeT = undefined; }
  takeRandom(w, p.troops, healthy(p.troops));
  p.troops = p.troops.filter(s => s.n > 0); for (const s of p.troops) s.w = s.n;
  news(w, `🏳 ${p.name} (${FACTIONS[p.fac].short}) ${by} tomonidan mag'lub etildi.`);
}

export function captureSett(w: World, s: Sett, fac: FacId, owner: string) {
  const old = s.fac;
  s.fac = fac; s.owner = owner; s.siegeBy = undefined; s.siegeT = undefined;
  for (const v of w.sets) if (v.bound === s.id) { v.fac = fac; v.owner = owner; }
  news(w, `🏰 ${s.name} ${FACTIONS[old].short}dan ${owner === 'player' ? w.player.name : FACTIONS[fac].short}ga o'tdi!`);
}

// ---------------------------------------------------------------- AI qarorlari
function decide(w: World, p: Party) {
  const myP = power(p.troops);
  const near = w.parties.filter(o => o !== p && !o.down && d2(o, p) < 7.5 && hostile(w, p, o));
  const threat = near.filter(o => power(o.troops) > myP * 1.25).sort((a, b) => d2(a, p) - d2(b, p))[0];
  if (threat && p.mode !== 'siege') {
    const dx = p.x - threat.x, dy = p.y - threat.y, L = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
    const tx = Math.min(MAP_SIZE - 2, Math.max(2, p.x + (dx / L) * 6)), ty = Math.min(MAP_SIZE - 2, Math.max(2, p.y + (dy / L) * 6));
    p.goal = { kind: 'pt', x: tx, y: ty }; p.mode = 'flee'; p.modeT = 1.5; return;
  }
  const preyR = p.kind === 'bandit' ? 5.5 : 6.5;
  const prey = near.filter(o => d2(o, p) < preyR && power(o.troops) < myP * (p.kind === 'bandit' ? 0.85 : 0.8)).sort((a, b) => d2(a, p) - d2(b, p))[0];
  if (prey && p.mode !== 'siege') { p.goal = { kind: 'party', id: prey.id }; p.mode = 'chase'; p.modeT = 2; return; }
  if (p.kind === 'bandit') {
    p.goal = { kind: 'pt', x: Math.min(MAP_SIZE - 3, Math.max(3, p.x + (rand(w) - 0.5) * 12)), y: Math.min(MAP_SIZE - 3, Math.max(3, p.y + (rand(w) - 0.5) * 12)) };
    p.mode = 'patrol'; p.modeT = 4 + rand(w) * 4; return;
  }
  if ((p.mode === 'siege' || p.mode === 'raid') && p.modeT > 0 && p.goal) return;
  for (const s of w.sets) if (s.siegeBy === p.id) { s.siegeBy = undefined; s.siegeT = undefined; }
  const target = p.king ? 85 : 55;
  if (healthy(p.troops) < target * 0.45) {
    const home = w.sets.filter(s => s.fac === p.fac && s.kind !== 'village' && !s.siegeBy).sort((a, b) => d2(a, p) - d2(b, p))[0];
    if (home) { p.goal = { kind: 'set', id: home.id }; p.mode = 'home'; p.modeT = 24; return; }
  }
  const enemies = w.sets.filter(s => atWar(w, p.fac, s.fac) && s.fac !== 'bandit');
  if (enemies.length) {
    const r = rand(w);
    if (r < 0.12) {
      const tgt = enemies.filter(s => s.kind !== 'village' && d2(s, p) < 40 && myP > power(s.garrison) * (s.kind === 'town' ? 2.6 : 2.2) && !s.siegeBy).sort((a, b) => d2(a, p) - d2(b, p))[0];
      if (tgt) { p.goal = { kind: 'set', id: tgt.id }; p.mode = 'siege'; p.modeT = 60; return; }
    } else if (r < 0.4) {
      const v = enemies.filter(s => s.kind === 'village' && s.looted < w.t && d2(s, p) < 35).sort((a, b) => d2(a, p) - d2(b, p))[0];
      if (v) { p.goal = { kind: 'set', id: v.id }; p.mode = 'raid'; p.modeT = 40; return; }
    }
  }
  const own = w.sets.filter(s => s.fac === p.fac);
  const s = own.length ? pick(w, own) : null;
  if (s) { p.goal = { kind: 'pt', x: s.x + (rand(w) - 0.5) * 6, y: s.y + (rand(w) - 0.5) * 6 }; p.mode = 'patrol'; p.modeT = 6 + rand(w) * 6; }
}

function arrive(w: World, p: Party, out: WEvent[]) {
  const g = p.goal; if (!g || g.kind !== 'set') { p.goal = null; return; }
  const s = setById(w, g.id); if (!s) { p.goal = null; return; }
  if (p.mode === 'raid') {
    if (!atWar(w, p.fac, s.fac) || s.looted > w.t) { p.goal = null; p.mode = 'idle'; return; }
    p.busy = (p.busy ?? 0) + 0; p.goal = null; p.mode = 'idle'; p.modeT = 4;
    s.looted = w.t + 96; s.vol = 0; s.prosper = Math.max(0.4, s.prosper - 0.15); p.gold += 180;
    news(w, `🔥 ${p.name} ${s.name} qishlog'ini taladi.`);
    if (s.owner === 'player') out.push({ k: 'news', text: `🔥 ${p.name} sizning ${s.name} qishlog'ingizni taladi!`, important: true });
  } else if (p.mode === 'siege') {
    if (!atWar(w, p.fac, s.fac)) { p.goal = null; p.mode = 'idle'; return; }
    if (s.siegeBy && s.siegeBy !== p.id) { p.goal = null; p.mode = 'idle'; return; }
    if (!s.siegeBy) {
      s.siegeBy = p.id; s.siegeT = w.t; p.modeT = 14;
      news(w, `🛡 ${p.name} ${s.name}ni qamal qildi.`);
      if (s.owner === 'player') out.push({ k: 'news', text: `🛡 ${p.name} sizning ${s.name} qal'angizni qamal qilmoqda! Yordamga boring.`, important: true });
    }
  } else if (p.mode === 'home') {
    p.goal = null; p.mode = 'idle'; p.modeT = 24; p.x = s.x + 0.6; p.y = s.y + 0.5;
  } else p.goal = null;
}

function siegeTick(w: World, p: Party) {
  const s = p.goal?.kind === 'set' ? setById(w, p.goal.id) : undefined;
  if (!s || s.siegeBy !== p.id) return;
  if (w.t - (s.siegeT ?? w.t) < 12) return;
  const win = autoResolve(w, p.troops, s.garrison, s.kind === 'town' ? 1.8 : 1.6);
  if (win === 0) {
    captureSett(w, s, p.fac, p.id);
    s.garrison = [];
    const move = Math.floor(healthy(p.troops) * 0.3);
    for (let i = 0; i < move; i++) { const st = p.troops.find(x => x.n - x.w > 0); if (!st) break; st.n--; addTroops(s.garrison, st.id, 1); }
    p.troops = p.troops.filter(x => x.n > 0);
    fillGarrison(w, s, s.kind === 'town' ? 30 : 22);
  } else {
    s.siegeBy = undefined; s.siegeT = undefined;
    news(w, `🛡 ${s.name} himoyachilari ${p.name} hujumini qaytardi.`);
    routLord(w, p, `${s.name} garnizoni`);
  }
  p.goal = null; p.mode = 'idle';
}

// ---------------------------------------------------------------- kunlik/haftalik
function daily(w: World, out: WEvent[]) {
  const pl = player(w);
  const n = count(pl.troops);
  w.player.food -= Math.max(1, Math.ceil(n / 9));
  if (w.player.food <= 0) {
    w.player.food = 0;
    const k = Math.max(1, Math.round(healthy(pl.troops) * 0.05));
    takeRandom(w, pl.troops, k);
    out.push({ k: 'news', text: `🌾 Oziq-ovqat tugadi! ${k} askar qochib ketdi. Bozordan oziq sotib oling.`, important: true });
  }
  for (const p of w.parties) for (const s of p.troops) s.w = Math.max(0, s.w - Math.ceil(s.w * (p.kind === 'player' ? 0.22 : 0.3)));
  for (const s of w.sets) {
    if (s.kind === 'village') { if (s.looted < w.t) s.vol = Math.min(12, s.vol + 1 + (rand(w) < s.prosper - 0.5 ? 1 : 0)); s.prosper = Math.min(1.3, s.prosper + 0.005); }
    else if (s.owner !== 'player' && !s.siegeBy) fillGarrison(w, s, Math.min(count(s.garrison) + 4, s.kind === 'town' ? 60 : 40));
  }
  for (const p of w.parties) {
    if (p.kind !== 'lord' || p.down) continue;
    const home = p.mode === 'idle' && w.sets.some(s => s.fac === p.fac && s.kind !== 'village' && d2(s, p) < 1.5);
    fillLordTroops(w, p, Math.min(p.king ? 85 : 55, count(p.troops) + (home ? 14 : 3)));
  }
  // lordlarni qaytarish
  for (const p of w.parties) if (p.down && p.down < w.t && p.kind === 'lord') {
    const home = w.sets.filter(s => s.fac === p.fac && s.kind !== 'village').sort((a, b) => (a.id === p.home ? -1 : 0) - (b.id === p.home ? -1 : 0))[0];
    if (!home) continue;
    p.down = undefined; p.x = home.x + 0.7; p.y = home.y + 0.5; p.troops = p.troops.filter(s => s.n > 0); for (const s of p.troops) s.w = 0;
    fillLordTroops(w, p, 25); p.mode = 'idle'; p.modeT = 2;
  }
  // fraksiya yo'q bo'lsa lordlari yo'qoladi
  w.parties = w.parties.filter(p => p.kind !== 'lord' || w.sets.some(s => s.fac === p.fac) || !p.down);
  const bandits = w.parties.filter(p => p.kind === 'bandit').length;
  if (bandits < 15) spawnBandit(w);
  if (dayOf(w) % 4 === 0) diplomacy(w);
}

function weekly(w: World, out: WEvent[]) {
  const pl = player(w);
  const inc = weeklyIncome(w, 'player'), wages = weeklyWages(w);
  pl.gold += inc - wages;
  let msg = `📅 Hafta: soliq +${inc}, maosh -${wages} tanga.`;
  if (pl.gold < 0) {
    pl.gold = 0; const k = Math.max(1, Math.round(healthy(pl.troops) * 0.12)); takeRandom(w, pl.troops, k);
    msg += ` Maosh to'lanmadi — ${k} askar ketdi!`;
  }
  out.push({ k: 'news', text: msg, important: pl.gold === 0 });
  for (const p of w.parties) if (p.kind === 'lord') p.gold += weeklyIncome(w, p.id) / 2;
  for (const s of w.sets) if (s.kind === 'town') s.merc = { id: `${pick(w, CULTURE_LIST)}_${pick(w, ['inf3', 'arc3', 'cav3', 'spr3', 'cav4'])}`, n: 3 + Math.floor(rand(w) * 7) };
}

function diplomacy(w: World) {
  const ai = CULTURE_LIST.filter(c => w.sets.some(s => s.fac === c));
  for (const k of w.wars.slice()) {
    const [a, b] = k.split('|') as [FacId, FacId];
    if (a === 'player' || b === 'player') continue;
    if (w.t - (w.warSince[k] ?? 0) > 24 * 10 && rand(w) < 0.35) makePeace(w, a, b);
  }
  for (const c of ai) {
    const wars = ai.filter(o => atWar(w, c, o)).length;
    if (wars === 0 && rand(w) < 0.25) { const o = pick(w, ai.filter(x => x !== c)); if (o) declareWar(w, c, o); }
  }
  if (!w.player.liege && w.sets.some(s => s.owner === 'player') && rand(w) < 0.2) {
    const near = ai.filter(c => !atWar(w, c, 'player'));
    if (near.length) declareWar(w, pick(w, near), 'player');
  }
}

// ---------------------------------------------------------------- asosiy qadam
export function step(w: World, dt: number): WEvent[] {
  const out: WEvent[] = [];
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(0.1, left); left -= h;
    const prevDay = Math.floor(w.t / 24);
    w.t += h;
    for (const p of w.parties) {
      if (p.down) continue;
      if (p.kind !== 'player') {
        p.modeT -= h;
        if (p.mode === 'siege') siegeTick(w, p);
        if (p.modeT <= 0 || !p.goal) decide(w, p);
      }
      if (!p.goal) continue;
      const gp = goalPoint(w, p.goal);
      if (!gp) { p.goal = null; continue; }
      const dx = gp.x - p.x, dy = gp.y - p.y, L = Math.sqrt(dx * dx + dy * dy);
      const reach = p.goal.kind === 'set' ? 0.45 : p.goal.kind === 'party' ? 0.6 : 0.15;
      if (L <= reach) {
        if (p.kind === 'player') {
          const g = p.goal; p.goal = null;
          if (g.kind === 'set') { out.push({ k: 'enter', id: g.id }); return out; }
          if (g.kind === 'party') { out.push({ k: 'meet', id: g.id }); return out; }
        } else if (p.goal.kind === 'set') { if (p.mode === 'siege' && setById(w, p.goal.id)?.siegeBy === p.id) continue; arrive(w, p, out); }
        else if (p.goal.kind === 'pt') { p.goal = null; }
        continue;
      }
      const sp = speedOf(w, p) * h;
      const k = Math.min(1, sp / L);
      p.x += dx * k; p.y += dy * k;
    }
    // to'qnashuvlar
    for (const a of w.parties) {
      if (a.down || a.kind === 'player') continue;
      for (const b of w.parties) {
        if (b === a || b.down) continue;
        if (d2(a, b) > 0.6 || !hostile(w, a, b)) continue;
        const chasing = a.goal?.kind === 'party' && a.goal.id === b.id;
        if (b.kind === 'player') {
          if (chasing) { a.goal = null; a.modeT = 1; out.push({ k: 'attacked', id: a.id }); return out; }
          continue;
        }
        if (!chasing) continue;
        const win = autoResolve(w, a.troops, b.troops);
        const [W, L] = win === 0 ? [a, b] : [b, a];
        W.gold += Math.round(L.gold * 0.3); L.gold = Math.round(L.gold * 0.7);
        if (L.kind === 'bandit') { L.troops = []; L.down = w.t; } else routLord(w, L, W.name);
        if (W.kind === 'bandit') W.goal = null;
        a.goal = null;
      }
    }
    w.parties = w.parties.filter(p => !(p.kind === 'bandit' && (p.down || count(p.troops) === 0)));
    if (Math.floor(w.t / 24) > prevDay) {
      daily(w, out);
      if (Math.floor(w.t / 24) % 7 === 0) weekly(w, out);
    }
    if (out.some(e => e.k === 'news' && e.important)) return out;
  }
  return out;
}

// ---------------------------------------------------------------- o'yinchi amallari
export function recruitVillage(w: World, s: Sett, n: number) {
  const pl = player(w);
  const can = Math.min(n, s.vol, maxParty(w) - count(pl.troops), Math.floor(pl.gold / 12));
  if (can <= 0) throw new Error(s.vol <= 0 ? "Ko'ngillilar qolmadi" : count(pl.troops) >= maxParty(w) ? "Otryad to'la (obro' oshiring)" : 'Tanga yetmaydi');
  pl.gold -= can * 12; s.vol -= can; addTroops(pl.troops, `${s.cu}_t1`, can);
  return can;
}
export function hireMerc(w: World, s: Sett) {
  const pl = player(w); const m = s.merc; if (!m || m.n <= 0) throw new Error("Taverna bo'sh");
  const price = mercCost(troop(m.id).tier) * m.n;
  if (pl.gold < price) throw new Error('Tanga yetmaydi');
  if (count(pl.troops) + m.n > maxParty(w)) throw new Error("Otryad to'la");
  pl.gold -= price; addTroops(pl.troops, m.id, m.n); s.merc = { id: m.id, n: 0 };
  return price;
}
export function buyFood(w: World, amount: number, price: number) {
  const pl = player(w); const cost = Math.ceil(amount * price);
  if (pl.gold < cost) throw new Error('Tanga yetmaydi');
  pl.gold -= cost; w.player.food += amount;
}
export function sellPrisoners(w: World): number {
  let g = 0; for (const s of w.player.prisoners) g += s.n * (6 + troop(s.id).tier ** 2 * 8);
  w.player.prisoners = []; player(w).gold += g; return g;
}
export function upgrade(w: World, from: string, to: string, n: number) {
  const pl = player(w); const st = pl.troops.find(s => s.id === from); if (!st) throw new Error('Topilmadi');
  const t = troop(from); if (!t.up.includes(to)) throw new Error("Bunday yo'nalish yo'q");
  const can = Math.min(n, st.n - st.w, Math.floor(st.xp / xpNeed(t.tier)), Math.floor(pl.gold / upgradeCost(t.tier)));
  if (can <= 0) throw new Error(st.xp < xpNeed(t.tier) ? 'Tajriba yetmaydi' : 'Tanga yetmaydi');
  st.n -= can; st.xp -= can * xpNeed(t.tier); pl.gold -= can * upgradeCost(t.tier);
  if (st.n <= 0) pl.troops.splice(pl.troops.indexOf(st), 1);
  addTroops(pl.troops, to, can);
  return can;
}
export const upgradable = (st: Stack) => { const t = troop(st.id); return t.up.length ? Math.min(st.n - st.w, Math.floor(st.xp / xpNeed(t.tier))) : 0; };

export function raidVillage(w: World, s: Sett) {
  const pl = player(w);
  if (s.looted > w.t) throw new Error('Bu qishloq yaqinda talangan');
  if (!atWar(w, playerFac(w), s.fac)) {
    if (w.player.liege) throw new Error(`Siz ${FACTIONS[w.player.liege].name} vassalisiz — tinch qishloqni talay olmaysiz`);
    declareWar(w, 'player', s.fac);
  }
  const g = Math.round(220 * s.prosper);
  pl.gold += g; w.player.food += 25; s.looted = w.t + 96; s.vol = 0; s.prosper = Math.max(0.4, s.prosper - 0.15);
  w.rel[s.fac] = (w.rel[s.fac] ?? 0) - 15;
  news(w, `🔥 ${w.player.name} ${s.name} qishlog'ini taladi.`);
  return g;
}

export function joinFaction(w: World, f: FacId) {
  if (w.player.liege) throw new Error('Siz allaqachon vassalsiz');
  if (atWar(w, 'player', f)) throw new Error('Avval sulh tuzing');
  if (w.player.renown < 25) throw new Error(`Obro' kamida 25 bo'lishi kerak (hozir ${w.player.renown})`);
  w.player.liege = f;
  for (const k of w.wars.slice()) if (k.includes('player')) w.wars = w.wars.filter(x => x !== k);
  for (const s of w.sets) if (s.owner === 'player') s.fac = f;
  w.rel[f] = (w.rel[f] ?? 0) + 10;
  news(w, `🤝 ${w.player.name} ${FACTIONS[f].name}ga vassal bo'ldi.`);
}
export function leaveFaction(w: World) {
  const f = w.player.liege; if (!f) return;
  w.player.liege = null;
  const fiefs = w.sets.filter(s => s.owner === 'player');
  for (const s of fiefs) s.fac = 'player';
  w.rel[f] = (w.rel[f] ?? 0) - 20;
  news(w, `🚪 ${w.player.name} ${FACTIONS[f].name} xizmatini tark etdi.`);
  if (fiefs.length) declareWar(w, 'player', f);
}
export function peaceCost(w: World) { return 250 + 150 * w.sets.filter(s => s.owner === 'player').length; }
export function proposePeace(w: World, f: FacId) {
  const pl = player(w); const cost = peaceCost(w);
  if (!atWar(w, 'player', f)) throw new Error('Urush yo\'q');
  if (pl.gold < cost) throw new Error(`Tovon uchun ${cost} tanga kerak`);
  const age = w.t - (w.warSince[key('player', f)] ?? w.t);
  if (age < 48 && w.player.renown < 40) throw new Error("Ular hali sulhga tayyor emas (kamida 2 kun o'tsin)");
  pl.gold -= cost; makePeace(w, 'player', f);
}

/** O'yinchi jangdan keyin: yo'qotishlar, asirlar, tajriba, o'lja */
export interface BattleApply { win: boolean; lost0: Record<string, number>; lost1: Record<string, number>; heroKills: number; retreated: boolean }
export function applyPlayerBattle(w: World, enemy: { party?: Party; sett?: Sett }, r: BattleApply): string[] {
  const pl = player(w); const lines: string[] = [];
  applyLosses(pl.troops, r.lost0, 0.55, w);
  const enemyStacks = enemy.party ? enemy.party.troops : enemy.sett!.garrison;
  const killedPower = Object.entries(r.lost1).reduce((a, [id, n]) => a + n * troopPower(id), 0);
  applyLosses(enemyStacks, r.lost1, 0, w);
  if (r.retreated) {
    const k = Math.round(healthy(pl.troops) * 0.1); takeRandom(w, pl.troops, k, 0.5);
    lines.push(`Chekinishda ${k} askar qoldi.`);
  }
  const xp = Math.round(killedPower * 14);
  const hn = healthy(pl.troops);
  if (hn > 0) for (const s of pl.troops) s.xp += Math.round(xp * (s.n - s.w) / hn);
  w.player.xp += r.heroKills * 18 + (r.win ? 30 : 5);
  w.player.kills += Object.values(r.lost1).reduce((a, b) => a + b, 0);
  while (w.player.xp >= levelXp(w.player.level) && w.player.level < 40) { w.player.xp -= levelXp(w.player.level); w.player.level++; lines.push(`⭐ Daraja oshdi: ${w.player.level}!`); }
  if (!r.win) { w.player.losses++; return lines; }
  w.player.wins++;
  const ren = Math.max(1, Math.round(killedPower * 0.35 + (enemy.party?.kind === 'lord' ? 6 : 0) + (enemy.sett ? 10 : 0)));
  w.player.renown += ren; lines.push(`Obro' +${ren}`);
  for (const [id, n] of Object.entries(r.lost1)) { const pr = Math.round(n * 0.35); if (pr > 0) addTroops(w.player.prisoners, id, pr); }
  if (enemy.party) {
    const e = enemy.party;
    const loot = Math.round(e.gold * (e.kind === 'lord' ? 0.25 : 1)) + Math.round(killedPower * 6);
    pl.gold += loot; e.gold = Math.max(0, e.gold - loot); lines.push(`O'lja: ${loot} tanga`);
    if (e.kind === 'bandit') { e.down = w.t; e.troops = []; w.parties = w.parties.filter(p => p !== e); }
    else routLord(w, e, w.player.name);
  }
  if (enemy.sett) {
    const s = enemy.sett;
    captureSett(w, s, playerFac(w), 'player');
    s.garrison = []; lines.push(`🏰 ${s.name} endi sizniki! Garnizon qoldirishni unutmang.`);
    const loot = Math.round(300 * s.prosper * (s.kind === 'town' ? 2 : 1)); pl.gold += loot; lines.push(`Xazina: ${loot} tanga`);
  }
  return lines;
}

/** O'yinchi asir tushdi: qo'shin yo'qoladi, vaqt o'tadi, yaqin shaharda ozod bo'ladi */
export function playerCaptured(w: World): string {
  const pl = player(w);
  pl.troops = []; const lostGold = Math.round(pl.gold * 0.35); pl.gold -= lostGold;
  w.player.renown = Math.max(0, w.player.renown - 5);
  for (let i = 0; i < 48; i++) step(w, 1);
  const town = w.sets.filter(s => s.kind === 'town' && !atWar(w, playerFac(w), s.fac)).sort((a, b) => d2(a, pl) - d2(b, pl))[0] ?? w.sets.find(s => s.kind === 'town')!;
  pl.x = town.x + 1; pl.y = town.y + 0.8; pl.goal = null;
  addTroops(pl.troops, `${town.cu}_t1`, 3);
  return `Asirlikda 2 kun o'tdi. ${lostGold} tanga yo'qotdingiz va ${town.name} yonida ozod bo'ldingiz.`;
}
