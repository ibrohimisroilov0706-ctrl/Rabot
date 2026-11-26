// apps/client/src/lord/battle.ts
// Real vaqtli jang dvigateli (yon ko'rinish, 2.5D). DOM yo'q, faqat seed'li tasodif va + - * / sqrt:
// bir xil sozlama + bir xil buyruqlar -> barcha qurilmalarda bir xil natija (do'stlar dueli shunga tayanadi).

import { rng, type Culture, type Terrain, type Weather } from '@qirolliklar/game-rules';
import { groupOf, troop, type Cls, type Group } from './data.js';

export const FIELD_W = 1400, FIELD_D = 300, WALL_X = 1060;
const LADDERS = [55, 120, 185, 250];
const CLIMB_T = 2.6;

export type Order = 'charge' | 'hold' | 'advance' | 'retreat';
export interface SideSetup { name: string; cu: Culture; color?: string; stacks: { id: string; n: number }[]; hero?: { name: string; level: number }; ai: boolean }
export interface BattleSetup { seed: string; terrain: Terrain; weather: Weather; siege: boolean; size: number; sides: [SideSetup, SideSetup] }

export interface BUnit {
  id: number; side: 0 | 1; tid: string; cls: Cls; grp: Group; cu: Culture;
  x: number; y: number; hx: number; hy: number; sx: number;
  hp: number; maxHp: number; atk: number; def: number; spd: number; range: number;
  cd: number; tgt: number; retgt: number; dead: boolean; deadT: number;
  face: 1 | -1; act: 'idle' | 'walk' | 'attack'; actT: number;
  hero: boolean; climb: number; onWall: boolean; charge: number; bounce: number; lane: number; kills: number; skin: number;
}
export interface Proj { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; dmg: number; side: 0 | 1; tgt: number; stone: boolean }
export interface BattleResult {
  winner: 0 | 1; lost: [Record<string, number>, Record<string, number>]; kills: [number, number];
  heroKills: number; heroDown: [boolean, boolean]; retreated: boolean; time: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = a.x - b.x, dy = (a.y - b.y) * 1.4; return Math.sqrt(dx * dx + dy * dy); };

export class Battle {
  readonly setup: BattleSetup;
  units: BUnit[] = [];
  projs: Proj[] = [];
  t = 0;
  orders: [Record<Group, Order>, Record<Group, Order>] = [{ inf: 'hold', arch: 'hold', cav: 'hold' }, { inf: 'hold', arch: 'hold', cav: 'hold' }];
  advanced: [Record<Group, number>, Record<Group, number>] = [{ inf: 0, arch: 0, cav: 0 }, { inf: 0, arch: 0, cav: 0 }];
  reserve: [string[], string[]] = [[], []];
  ai: [boolean, boolean];
  heroGoal: { x: number; y: number } | null = null;
  result: BattleResult | null = null;
  events: { kind: 'hit' | 'death' | 'shot'; x: number; y: number }[] = [];
  private R: () => number;
  private nextId = 1;
  private ladderBusy = [0, 0, 0, 0];
  private aiTimer = 0; private reinfTimer = 0;
  private lost: [Record<string, number>, Record<string, number>] = [{}, {}];
  private heroKills = 0;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.R = rng(`battle:${setup.seed}`);
    this.ai = [setup.sides[0].ai, setup.sides[1].ai];
    for (const s of [0, 1] as const) {
      const all: string[] = [];
      for (const st of setup.sides[s].stacks) for (let i = 0; i < st.n; i++) all.push(st.id);
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(this.R() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!]; }
      const field = all.slice(0, setup.size); this.reserve[s] = all.slice(setup.size);
      const counts: Record<Group, number> = { inf: 0, arch: 0, cav: 0 };
      // tartib: kuchlilar oldinda emas, guruh bo'yicha joylashadi
      for (const tid of field) { const g = groupOf(troop(tid).cls); this.spawn(s, tid, this.slot(s, g, counts[g]++), false); }
      const h = setup.sides[s].hero;
      if (h) this.spawnHero(s, h.level);
    }
    if (setup.siege) this.orders[1] = { inf: 'hold', arch: 'hold', cav: 'hold' };
  }

  // ---------------------------------------------------------------- joylashuv
  private slot(side: 0 | 1, g: Group, idx: number): { x: number; y: number } {
    const jx = (this.R() - 0.5) * 7, jy = (this.R() - 0.5) * 7;
    if (this.setup.siege && side === 1) {
      const rows = 12, col = Math.floor(idx / rows), row = idx % rows;
      const base = g === 'inf' ? 16 : g === 'arch' ? 40 : 150;
      return { x: WALL_X + base + col * 18 + jx * 0.5, y: 22 + row * 23 + (col % 2) * 8 + jy };
    }
    let y: number, col: number;
    if (g === 'cav') { const rows = 4; col = Math.floor(idx / (rows * 2)); const r = idx % (rows * 2); y = r < rows ? 22 + r * 20 : FIELD_D - 22 - (r - rows) * 20; y += (col % 2) * 8; }
    else { const rows = 9; col = Math.floor(idx / rows); const r = idx % rows; y = 60 + r * 22.5 + (col % 2) * 9; }
    const base = g === 'inf' ? 0 : g === 'arch' ? 95 : 175;
    const xl = (this.setup.siege ? 470 : 440) - base - col * (g === 'cav' ? 26 : 18) + jx;
    return { x: side === 0 ? xl : FIELD_W - xl, y: y + jy };
  }

  private spawn(side: 0 | 1, tid: string, p: { x: number; y: number }, reinforcement: boolean): BUnit {
    const d = troop(tid);
    const wx = this.setup.weather;
    const u: BUnit = {
      id: this.nextId++, side, tid, cls: d.cls, grp: groupOf(d.cls), cu: d.cu,
      x: p.x, y: p.y, hx: p.x, hy: p.y, sx: p.x,
      hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def,
      spd: d.spd * 1.35 * (wx === 'qor' ? 0.85 : 1) * (this.setup.terrain === 'ormon' && d.cls !== 'inf' && d.cls !== 'spear' ? 0.85 : 1),
      range: d.range * (wx === 'tuman' ? 0.7 : 1),
      cd: this.R() * 1.2, tgt: -1, retgt: this.R() * 0.5, dead: false, deadT: 0,
      face: side === 0 ? 1 : -1, act: 'idle', actT: this.R(), hero: false, climb: 0,
      onWall: this.setup.siege && side === 1 && groupOf(d.cls) !== 'cav', charge: 0, bounce: 0, lane: ((this.nextId * 37) % 21) - 10, kills: 0, skin: Math.floor(this.R() * 3),
    };
    if (reinforcement) { u.x = side === 0 ? 30 : FIELD_W - 30; u.sx = u.x; if (this.setup.siege && side === 1) u.x = FIELD_W - 60; }
    this.units.push(u);
    return u;
  }

  private spawnHero(side: 0 | 1, level: number) {
    const cu = this.setup.sides[side].cu;
    const p = this.slot(side, 'inf', 5);
    const u = this.spawn(side, `${cu}_cav3`, { x: p.x + (side === 0 ? 40 : -40), y: FIELD_D / 2 }, false);
    u.hero = true; u.cls = 'cav'; u.grp = 'cav'; u.range = 0;
    u.maxHp = u.hp = 170 + level * 14; u.atk = 21 + level * 2; u.def = 32 + level; u.spd = 130;
    u.tid = `${cu}_cav4`;
  }

  heroOf(side: 0 | 1) { return this.units.find(u => u.hero && u.side === side) ?? null; }

  // ---------------------------------------------------------------- buyruqlar
  command(side: 0 | 1, g: Group | 'all', o: Order) {
    const gs: Group[] = g === 'all' ? ['inf', 'arch', 'cav'] : [g];
    for (const gg of gs) {
      if (this.setup.siege && side === 1) { this.orders[1][gg] = 'hold'; continue; }
      this.orders[side][gg] = o;
      if (o === 'advance') {
        const step = 160 * (side === 0 ? 1 : -1);
        this.advanced[side][gg] += step;
        for (const u of this.units) if (!u.dead && u.side === side && u.grp === gg && !u.hero) u.hx = Math.max(30, Math.min(this.setup.siege ? WALL_X - 40 : FIELD_W - 30, u.hx + step));
      }
      if (o === 'retreat') { this.advanced[side][gg] = 0; for (const u of this.units) if (!u.dead && u.side === side && u.grp === gg && !u.hero) u.hx = u.sx; }
    }
  }
  moveHero(x: number, y: number) { this.heroGoal = { x: Math.max(10, Math.min(FIELD_W - 10, x)), y: Math.max(10, Math.min(FIELD_D - 10, y)) }; }

  alive(side: 0 | 1) { let n = 0; for (const u of this.units) if (!u.dead && u.side === side) n++; return n; }
  total(side: 0 | 1) { return this.alive(side) + this.reserve[side].length; }

  // ---------------------------------------------------------------- AI
  private think(side: 0 | 1) {
    const o = this.orders[side];
    if (this.setup.siege) {
      if (side === 1) return;
      o.inf = 'charge'; o.cav = 'charge'; o.arch = 'charge'; return;
    }
    const mine = this.units.filter(u => !u.dead && u.side === side), theirs = this.units.filter(u => !u.dead && u.side !== side);
    const rangedMine = mine.filter(u => u.range > 0).length, rangedTheirs = theirs.filter(u => u.range > 0).length;
    o.arch = rangedMine < rangedTheirs * 0.6 ? 'charge' : 'hold';
    const infs = mine.filter(u => u.grp === 'inf');
    const cx = infs.length ? infs.reduce((a, u) => a + u.x, 0) / infs.length : (side === 0 ? 300 : 1100);
    const near = theirs.some(u => Math.abs(u.x - cx) < 230);
    if (this.t > 14 || near || rangedMine < rangedTheirs * 0.6 || theirs.length > mine.length * 1.5) o.inf = 'charge';
    if (this.t > 2.5) o.cav = 'charge';
  }

  // ---------------------------------------------------------------- qadam
  step(dt: number) {
    if (this.result) return;
    this.t += dt;
    this.events.length = 0;
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) { this.aiTimer = 1; for (const s of [0, 1] as const) if (this.ai[s]) this.think(s); }
    this.reinfTimer -= dt;
    if (this.reinfTimer <= 0) { this.reinfTimer = 1; this.reinforce(); }
    for (let i = 0; i < 4; i++) this.ladderBusy[i] = Math.max(0, this.ladderBusy[i]! - dt);
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    this.updateProjs(dt);
    this.checkEnd();
  }

  private reinforce() {
    for (const s of [0, 1] as const) {
      const al = this.alive(s); const want = this.setup.size;
      if (al < want * 0.6 && this.reserve[s].length) {
        const k = Math.min(this.reserve[s].length, want - al);
        for (let i = 0; i < k; i++) {
          const tid = this.reserve[s].shift()!; const g = groupOf(troop(tid).cls);
          const sl = this.slot(s, g, Math.floor(this.R() * 24));
          const u = this.spawn(s, tid, { x: sl.x + this.advanced[s][g], y: sl.y }, true);
          u.hx = Math.max(30, Math.min(FIELD_W - 30, sl.x + this.advanced[s][g])); u.sx = sl.x;
          if (this.setup.siege && s === 1) u.hx = Math.max(WALL_X + 12, sl.x);
        }
      }
    }
  }

  private nearestEnemy(u: BUnit): number {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.units.length; i++) {
      const e = this.units[i]!; if (e.dead || e.side === u.side) continue;
      let d = dist(u, e);
      if (this.setup.siege) {
        // devordagi himoyachi pastdagilarga yetolmaydi (kamonchidan boshqa)
        if (u.side === 1 && u.range === 0 && !e.onWall && e.climb < CLIMB_T * 0.6) d += 2000;
        if (u.side === 0 && u.range === 0 && !u.onWall && e.onWall) d += 60; // devorga chiqish kerak
      }
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private updateUnit(u: BUnit, dt: number) {
    u.cd -= dt; u.actT += dt; u.retgt -= dt; u.bounce = Math.max(0, u.bounce - dt);
    if (u.retgt <= 0 || u.tgt < 0 || this.units[u.tgt]!.dead) { u.tgt = this.nearestEnemy(u); u.retgt = 0.45 + this.R() * 0.35; }
    const e = u.tgt >= 0 ? this.units[u.tgt]! : null;
    const d = e ? dist(u, e) : 1e9;
    const order: Order = u.hero ? 'charge' : this.orders[u.side][u.grp];
    let goal: { x: number; y: number } | null = null;
    let attacking = false;
    const reach = u.cls === 'eleph' ? 36 : u.grp === 'cav' ? 28 : 23;

    if (u.hero && u.side === 0 && !this.ai[0]) {
      // o'yinchi qahramoni: bosilgan nuqtaga boradi, yaqindagi dushman bilan avtomatik urishadi
      if (e && d <= reach && u.cd <= 0) { this.melee(u, e); attacking = true; }
      else if (this.heroGoal) { goal = this.heroGoal; if (dist(u, goal) < 8) this.heroGoal = null; }
      else if (e && d < 90) goal = e;
    } else if (order === 'retreat') {
      goal = { x: u.hx, y: u.hy };
      if (e && d <= reach && u.cd <= 0 && u.range === 0) { this.melee(u, e); attacking = true; }
    } else if (u.range > 0) {
      const kite = u.cls === 'harch' && e && d < 70;
      if (e && d <= 30 && !kite) { if (u.cd <= 0) { this.melee(u, e, 0.5); attacking = true; } }
      else if (e && d <= u.range && !kite) { if (u.cd <= 0 && this.canShoot(u, e)) { this.shoot(u, e); attacking = true; } }
      else if (kite && e) goal = { x: u.x - (e.x - u.x), y: u.y - (e.y - u.y) };
      else if (order === 'charge' && e) goal = { x: e.x - Math.sign(e.x - u.x) * u.range * 0.8, y: e.y };
      else goal = { x: u.hx, y: u.hy };
      if (u.act === 'attack' && u.actT < 0.5) goal = null;
    } else {
      if (e && d <= reach && u.bounce <= 0) { if (u.cd <= 0) { this.melee(u, e); attacking = true; } }
      else if (u.bounce > 0) goal = { x: u.x - u.face * 60, y: u.y };
      else if (order === 'charge' && e) goal = e;
      else if (e && d < (u.grp === 'cav' ? 110 : 75) && !(this.setup.siege && u.side === 1 && !e.onWall && e.climb < CLIMB_T * 0.6)) goal = e;
      else goal = { x: u.hx, y: u.hy };
    }

    if (attacking) { u.act = 'attack'; u.actT = 0; if (e) u.face = e.x >= u.x ? 1 : -1; u.charge = 0; return; }
    if (u.act === 'attack' && u.actT < 0.45) return;
    if (!goal) { u.act = 'idle'; return; }
    // harakat
    let gx = goal.x, gy = goal.y + (goal === e ? u.lane * 0.8 : 0);
    if (this.setup.siege) [gx, gy] = this.wallRules(u, gx, gy, dt);
    const dx = gx - u.x, dy = gy - u.y; const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 2) { u.act = 'idle'; u.charge = Math.max(0, u.charge - dt * 2); if (!e || d > 200) u.face = u.side === 0 ? 1 : -1; return; }
    const sp = u.spd * dt * (u.climb > 0 ? 0 : 1);
    const k = Math.min(1, sp / L);
    u.x += dx * k; u.y += dy * k * 0.8;
    if (u.y < 8) u.y = 8; if (u.y > FIELD_D - 8) u.y = FIELD_D - 8;
    if (Math.abs(dx) > 1) u.face = dx > 0 ? 1 : -1;
    u.act = 'walk';
    if (u.grp === 'cav' && L > 20) u.charge = Math.min(1, u.charge + dt * 0.7); else u.charge = Math.max(0, u.charge - dt);
  }

  /** Qamal: hujumchilar narvon orqali chiqadi, himoyachilar devordan tushmaydi */
  private wallRules(u: BUnit, gx: number, gy: number, dt: number): [number, number] {
    if (u.side === 1) return [Math.max(WALL_X + 8, gx), gy];
    if (u.onWall || u.range > 0) { if (u.range > 0 && !u.onWall) gx = Math.min(gx, WALL_X - 40); return [gx, gy]; }
    if (gx < WALL_X - 30 && u.x < WALL_X - 60) return [gx, gy];
    // eng yaqin narvon
    let li = 0; for (let i = 1; i < 4; i++) if (Math.abs(LADDERS[i]! - u.y) < Math.abs(LADDERS[li]! - u.y)) li = i;
    const ly = LADDERS[li]!;
    if (u.x >= WALL_X - 14 && Math.abs(u.y - ly) < 8) {
      if (u.climb > 0 || this.ladderBusy[li]! <= 0) {
        this.ladderBusy[li] = 0.6; u.climb += dt;
        if (u.climb >= CLIMB_T) { u.climb = 0; u.onWall = true; u.x = WALL_X + 6; }
        return [u.x, u.y];
      }
      return [WALL_X - 22, ly + u.lane];
    }
    return [WALL_X - 12, ly];
  }

  private canShoot(u: BUnit, e: BUnit) { return !(this.setup.siege && u.side === 0 && !u.onWall && e.x < WALL_X && e.climb > 0); }

  private damage(a: BUnit, e: BUnit, k: number): number {
    let dmg = a.atk * (0.75 + this.R() * 0.5) * k;
    if (a.cls === 'spear' && e.grp === 'cav') dmg *= 1.9;
    if (a.grp === 'cav' && e.cls === 'arch') dmg *= 1.3;
    if (a.grp === 'cav' && a.range === 0) dmg *= 1 + a.charge * 0.9;
    if (e.cls === 'eleph' && a.cls === 'spear') dmg *= 1.5;
    let def = e.def + (e.onWall && this.setup.siege && e.side === 1 ? 14 : 0);
    if (this.setup.terrain === 'tog' && e.side === 1) def += 4;
    return dmg * 40 / (40 + def);
  }

  private melee(u: BUnit, e: BUnit, k = 1) {
    u.cd = u.grp === 'cav' ? 1.35 : u.cls === 'eleph' ? 1.6 : 1.15;
    this.hit(u, e, this.damage(u, e, k));
    if (u.cls === 'eleph') {
      let n = 0;
      for (const o of this.units) { if (n >= 2) break; if (!o.dead && o.side !== u.side && o !== e && dist(o, u) < 40) { this.hit(u, o, this.damage(u, o, 0.6)); n++; } }
    }
    if (u.grp === 'cav' && u.charge > 0.5 && !u.hero && u.cls !== 'eleph') u.bounce = 0.9;
  }

  private shoot(u: BUnit, e: BUnit) {
    u.cd = u.cls === 'harch' ? 2.0 : 2.4;
    const d = dist(u, e);
    let dmg = this.damage(u, e, this.setup.weather === 'yomgir' ? 0.8 : 1);
    if (e.onWall && this.setup.siege && e.side === 1) dmg *= 0.6;
    if (u.onWall && this.setup.siege && u.side === 1) dmg *= 1.15;
    this.projs.push({ x0: u.x + u.face * 8, y0: u.y, x1: e.x, y1: e.y, t: 0, dur: 0.25 + d / 480, dmg, side: u.side, tgt: e.id, stone: false });
    this.events.push({ kind: 'shot', x: u.x, y: u.y });
  }

  private updateProjs(dt: number) {
    const keep: Proj[] = [];
    for (const p of this.projs) {
      p.t += dt;
      if (p.t < p.dur) { keep.push(p); continue; }
      // tushish nuqtasida nishon hali yaqinmi?
      let tg: BUnit | null = null;
      for (const u of this.units) if (u.id === p.tgt) { tg = u; break; }
      if (tg && !tg.dead && dist(tg, { x: p.x1, y: p.y1 }) < 26 && this.R() < 0.72) this.hitById(p.side, tg, p.dmg);
      else {
        for (const u of this.units) if (!u.dead && u.side !== p.side && dist(u, { x: p.x1, y: p.y1 }) < 12) { if (this.R() < 0.4) this.hitById(p.side, u, p.dmg * 0.8); break; }
      }
    }
    this.projs = keep;
  }

  private hitById(side: 0 | 1, e: BUnit, dmg: number) {
    e.hp -= dmg; this.events.push({ kind: 'hit', x: e.x, y: e.y });
    if (e.hp <= 0) this.kill(e, null, side);
  }
  private hit(a: BUnit, e: BUnit, dmg: number) {
    e.hp -= dmg; this.events.push({ kind: 'hit', x: e.x, y: e.y });
    if (e.hp <= 0) this.kill(e, a, a.side);
  }
  private kill(e: BUnit, by: BUnit | null, _side: 0 | 1) {
    e.dead = true; e.deadT = this.t; e.hp = 0; e.climb = 0;
    if (!e.hero) this.lost[e.side][e.tid] = (this.lost[e.side][e.tid] ?? 0) + 1;
    if (by) { by.kills++; if (by.hero && by.side === 0) this.heroKills++; }
    this.events.push({ kind: 'death', x: e.x, y: e.y });
  }

  private checkEnd() {
    const a0 = this.total(0), a1 = this.total(1);
    if (a0 > 0 && a1 > 0 && this.t < 900) return;
    let w: 0 | 1;
    if (a0 === 0) w = 1; else if (a1 === 0) w = 0;
    else w = this.setup.siege ? 1 : (a0 >= a1 ? 0 : 1);
    this.finish(w, false);
  }

  /** O'yinchi chekinadi: jang yutqazilgan hisoblanadi */
  retreat(side: 0 | 1) { if (!this.result) this.finish(side === 0 ? 1 : 0, true); }

  private finish(w: 0 | 1, retreated: boolean) {
    const kills: [number, number] = [0, 0];
    for (const s of [0, 1] as const) kills[s] = Object.values(this.lost[s === 0 ? 1 : 0]).reduce((a, b) => a + b, 0);
    const h0 = this.heroOf(0), h1 = this.heroOf(1);
    this.result = { winner: w, lost: this.lost, kills, heroKills: this.heroKills, heroDown: [!!h0?.dead, !!h1?.dead], retreated, time: this.t };
  }
}

/** Ikkala tomon AI bo'lsa: oxirigacha tez hisoblash (avto-jang, duel tekshiruvi) */
export function runToEnd(b: Battle, dt = 0.1): BattleResult {
  let guard = 0;
  while (!b.result && guard++ < 20000) b.step(dt);
  return b.result!;
}
