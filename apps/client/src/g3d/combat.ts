// apps/client/src/g3d/combat.ts
// Yaqin jang mantiqi (DOM yo'q, node testlarida ham ishlaydi):
// zarba = tayyorlanish -> urish -> qaytish; qalqon faqat old tomondan himoya qiladi; chidamlilik tugasa himoya sinadi;
// tayyorlanish paytida zarba yegan jangchi chayqaladi (vaqtni to'g'ri tanlash muhim).

import { rng } from '@qirolliklar/game-rules';
import { CIVS, type CivKey } from './civs.js';
import { angDiff, approachAng, clamp } from './engine/math.js';

export type FState = 'idle' | 'windup' | 'strike' | 'recover' | 'block' | 'stagger' | 'dead';
export type Cmd = 'follow' | 'charge' | 'hold' | 'retreat';

export interface Fighter {
  id: number; team: 0 | 1; civ: CivKey; hero: boolean; isPlayer: boolean;
  x: number; z: number; yaw: number; vx: number; vz: number; speed: number; phase: number;
  hp: number; maxHp: number; stam: number; maxStam: number; dmg: number; armor: number;
  state: FState; stateT: number; stateDur: number; attack: number; attackSeq: number; hitDone: boolean; deadT: number;
  // kiritish (o'yinchi yoki AI)
  mx: number; mz: number; run: boolean; wantYaw: number | null;
  // AI
  cmd: Cmd; homeX: number; homeZ: number; target: number; retgt: number; cd: number; blockUntil: number; reacted: number;
  skill: number; retreatT: number; retreatedOnce: boolean; slot: number;
  kills: number; flash: number;
}
export type CEvent = { k: 'hit' | 'block' | 'guardbreak' | 'kill' | 'swing'; a: number; b: number; x: number; z: number };

export const WINDUP = 0.34, WINDUP_NPC = 0.46, STRIKE = 0.14, RECOVER = 0.3, REACH = 1.8, ARC = 0.95;
export const ATTACK_STAM = 12, BLOCK_STAM = 15, SPRINT_DRAIN = 14;

export class Arena {
  fighters: Fighter[] = [];
  t = 0;
  events: CEvent[] = [];
  radius = 48;
  R: () => number;
  private nid = 1;
  constructor(seed = 'arena', public height: (x: number, z: number) => number = () => 0) { this.R = rng(seed); }

  spawn(team: 0 | 1, civ: CivKey, x: number, z: number, o: { hero?: boolean; player?: boolean; skill?: number; hp?: number } = {}): Fighter {
    const m = CIVS[civ].mods;
    const baseHp = (o.hp ?? (o.player ? 160 : o.hero ? 130 : 85)) * m.hp;
    const f: Fighter = {
      id: this.nid++, team, civ, hero: !!o.hero || !!o.player, isPlayer: !!o.player,
      x, z, yaw: team === 0 ? 0 : Math.PI, vx: 0, vz: 0, speed: 0, phase: this.R() * 6,
      hp: baseHp, maxHp: baseHp, stam: 100, maxStam: 100, dmg: (o.player ? 30 : o.hero ? 22 : 17) * m.dmg, armor: m.armor,
      state: 'idle', stateT: 0, stateDur: 0, attack: Math.floor(this.R() * 3), attackSeq: 0, hitDone: false, deadT: 0,
      mx: 0, mz: 0, run: false, wantYaw: null,
      cmd: 'charge', homeX: x, homeZ: z, target: -1, retgt: 0, cd: 1 + this.R(), blockUntil: 0, reacted: -1,
      skill: o.skill ?? 0.35, retreatT: 0, retreatedOnce: false, slot: 0, kills: 0, flash: 0,
    };
    this.fighters.push(f);
    return f;
  }
  byId(id: number) { return this.fighters.find(f => f.id === id); }
  alive(team?: 0 | 1) { return this.fighters.filter(f => f.state !== 'dead' && (team === undefined || f.team === team)); }

  setState(f: Fighter, s: FState, dur = 0) { f.state = s; f.stateT = 0; f.stateDur = dur; if (s === 'strike') f.hitDone = false; }

  /** zarba boshlash; true - boshlandi */
  attack(f: Fighter): boolean {
    if (f.state !== 'idle' && f.state !== 'block') return false;
    if (f.stam < ATTACK_STAM * 0.5) return false;
    f.stam = Math.max(0, f.stam - ATTACK_STAM);
    f.attack = (f.attack + 1 + (f.isPlayer ? 0 : Math.floor(this.R() * 2))) % 3;
    f.attackSeq++;
    this.setState(f, 'windup', f.isPlayer ? WINDUP : WINDUP_NPC);
    this.events.push({ k: 'swing', a: f.id, b: -1, x: f.x, z: f.z });
    return true;
  }
  block(f: Fighter, on: boolean) {
    if (on && f.state === 'idle') this.setState(f, 'block');
    else if (!on && f.state === 'block') this.setState(f, 'idle');
  }

  private resolveStrike(a: Fighter) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    let hits = 0;
    const cands = this.fighters.filter(b => b.team !== a.team && b.state !== 'dead')
      .map(b => ({ b, d: Math.hypot(b.x - a.x, b.z - a.z) })).filter(o => o.d < REACH).sort((p, q) => p.d - q.d);
    for (const { b, d } of cands) {
      if (hits >= 2) break;
      const dot = ((b.x - a.x) * fx + (b.z - a.z) * fz) / Math.max(0.01, d);
      if (dot < Math.cos(ARC)) continue;
      hits++;
      const toA = Math.atan2(a.x - b.x, a.z - b.z);
      const facing = Math.abs(angDiff(b.yaw, toA)) < 1.25;
      if (b.state === 'block' && facing) {
        const cost = BLOCK_STAM * CIVS[b.civ].mods.blockCost * (a.isPlayer ? 1.3 : 1);
        b.stam -= cost;
        if (b.stam < 0) {
          b.stam = 0; this.setState(b, 'stagger', 0.75); this.damage(a, b, 0.4);
          this.events.push({ k: 'guardbreak', a: a.id, b: b.id, x: b.x, z: b.z });
        } else {
          this.events.push({ k: 'block', a: a.id, b: b.id, x: b.x, z: b.z });
          // qalqonga tekkan zarba hujumchini sekinlashtiradi
          this.setState(a, 'recover', RECOVER + 0.25); a.hitDone = true;
          return;
        }
      } else {
        const wasWindup = b.state === 'windup';
        const back = Math.abs(angDiff(b.yaw, toA)) > 2.2;
        this.damage(a, b, back ? 1.35 : 1);
        if (b.state !== 'dead' && (wasWindup || !b.isPlayer)) this.setState(b, 'stagger', wasWindup ? 0.45 : 0.28);
        else if (b.state !== 'dead' && b.isPlayer) this.setState(b, 'stagger', 0.18);
      }
    }
  }

  private damage(a: Fighter, b: Fighter, k: number) {
    const dmg = a.dmg * k * (0.85 + this.R() * 0.3) * (1 - b.armor);
    b.hp -= dmg; b.flash = 0.18;
    // urilganda orqaga surilish
    const d = Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    b.vx += (b.x - a.x) / d * 2.2; b.vz += (b.z - a.z) / d * 2.2;
    this.events.push({ k: 'hit', a: a.id, b: b.id, x: b.x, z: b.z });
    if (b.hp <= 0) { b.hp = 0; this.setState(b, 'dead'); b.deadT = 0; a.kills++; this.events.push({ k: 'kill', a: a.id, b: b.id, x: b.x, z: b.z }); }
  }

  step(dt: number) {
    this.t += dt; this.events.length = 0;
    const F = this.fighters;
    for (const f of F) {
      f.stateT += dt; f.flash = Math.max(0, f.flash - dt);
      if (f.state === 'dead') { f.deadT += dt; f.speed = 0; continue; }
      // holat mashinasi
      if (f.state === 'windup' && f.stateT >= f.stateDur) this.setState(f, 'strike', STRIKE);
      else if (f.state === 'strike') { if (!f.hitDone) { f.hitDone = true; this.resolveStrike(f); } if (f.state === 'strike' && f.stateT >= f.stateDur) this.setState(f, 'recover', RECOVER); }
      else if (f.state === 'recover' && f.stateT >= f.stateDur) this.setState(f, 'idle');
      else if (f.state === 'stagger' && f.stateT >= f.stateDur) this.setState(f, 'idle');
      if ((f.state as FState) === 'dead') continue;
      // harakat
      const busy = f.state === 'windup' || f.state === 'strike' || f.state === 'recover' || f.state === 'block';
      const base = f.isPlayer ? 3.7 : 3.3;
      const sprint = f.run && f.stam > 5 && !busy;
      let sp = (sprint ? base * 1.55 : base) * CIVS[f.civ].mods.speed;
      if (busy) sp *= 0.42; if (f.state === 'stagger') sp = 0;
      const ml = Math.hypot(f.mx, f.mz);
      const tx = ml > 0.01 ? f.mx / Math.max(1, ml) * sp : 0, tz = ml > 0.01 ? f.mz / Math.max(1, ml) * sp : 0;
      const acc = Math.min(1, dt * 9);
      f.vx += (tx - f.vx) * acc; f.vz += (tz - f.vz) * acc;
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.speed = Math.hypot(f.vx, f.vz);
      f.phase += f.speed * dt * 2.3;
      if (f.wantYaw !== null && f.state !== 'stagger') f.yaw = approachAng(f.yaw, f.wantYaw, dt * (f.isPlayer ? 14 : 7));
      // chidamlilik
      if (sprint && f.speed > 0.5) f.stam -= SPRINT_DRAIN * dt;
      else if (f.state === 'idle') f.stam += 20 * CIVS[f.civ].mods.stamRegen * dt;
      else if (f.state === 'block') f.stam += 5 * dt;
      f.stam = clamp(f.stam, 0, f.maxStam);
      // maydon chegarasi
      const r = Math.hypot(f.x, f.z); if (r > this.radius) { f.x *= this.radius / r; f.z *= this.radius / r; }
    }
    // bir-biriga kirib ketmaslik
    for (let i = 0; i < F.length; i++) {
      const a = F[i]!; if (a.state === 'dead') continue;
      for (let j = i + 1; j < F.length; j++) {
        const b = F[j]!; if (b.state === 'dead') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.7 - d) / 2; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
      }
    }
  }
}
