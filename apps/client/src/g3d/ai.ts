// apps/client/src/g3d/ai.ts
// NPC askar AI: dushman topish, o'yinchiga ergashish, hujum, qalqon bilan himoyalanish, yarador bo'lsa chekinish,
// buyruqlarga bo'ysunish (Ergash / Hujum / Turing / Orqaga). Bir dushmanga bir vaqtda ko'pi bilan 2-3 kishi uriladi.

import { Arena, REACH, type Fighter } from './combat.js';
import { angDiff } from './engine/math.js';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function updateAI(ar: Arena, f: Fighter, dt: number, player: Fighter | null) {
  if (f.isPlayer || f.state === 'dead') return;
  f.retgt -= dt; f.cd -= dt;
  const enemies = ar.fighters.filter(e => e.team !== f.team && e.state !== 'dead');
  // nishon tanlash
  if (f.retgt <= 0 || !ar.byId(f.target) || ar.byId(f.target)!.state === 'dead') {
    f.retgt = 0.5 + ar.R() * 0.4;
    let pool = enemies;
    if (f.cmd === 'follow' && player) pool = enemies.filter(e => dist(e, player) < 9 || dist(e, f) < 3.5);
    if (f.cmd === 'hold') pool = enemies.filter(e => dist(e, { x: f.homeX, z: f.homeZ }) < 6 || dist(e, f) < 2.5);
    if (f.cmd === 'retreat') pool = enemies.filter(e => dist(e, f) < 2);
    let best: Fighter | null = null, bd = 1e9;
    for (const e of pool) {
      // bir nishonga ko'p odam yopishmasin
      const crowd = ar.fighters.filter(o => o !== f && o.team === f.team && o.state !== 'dead' && o.target === e.id && dist(o, e) < 2.5).length;
      const d = dist(e, f) + crowd * 1.6;
      if (d < bd) { bd = d; best = e; }
    }
    f.target = best ? best.id : -1;
  }
  const t = f.target >= 0 ? ar.byId(f.target) : undefined;
  f.mx = 0; f.mz = 0; f.run = false;

  // chekinish (yarador)
  if (f.retreatT > 0) {
    f.retreatT -= dt;
    if (t) { const d = Math.max(0.1, dist(f, t)); f.mx = (f.x - t.x) / d; f.mz = (f.z - t.z) / d; f.wantYaw = Math.atan2(t.x - f.x, t.z - f.z); ar.block(f, true); }
    if (f.retreatT <= 0) ar.block(f, false);
    return;
  }
  if (f.hp < f.maxHp * 0.25 && !f.retreatedOnce && t && ar.R() < 0.02) { f.retreatedOnce = true; f.retreatT = 2.2; return; }

  if (!t) {
    if (f.state === 'block') ar.block(f, false);
    // dushman yo'q: buyruq bo'yicha joylashish
    let gx = f.homeX, gz = f.homeZ;
    if ((f.cmd === 'follow' || f.cmd === 'charge') && player && player.state !== 'dead' && f.team === player.team) {
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      // qanotlarda: chap/o'ng tomonda biroz orqada (kamera ko'rinishini to'smaydi)
      const side = f.slot % 2 ? 1 : -1, k = Math.floor(f.slot / 2);
      const lat = side * (1.9 + (k % 3) * 1.3), back = 0.4 + Math.floor(k / 3) * 1.5;
      gx = player.x - fx * back + rx * lat; gz = player.z - fz * back + rz * lat;
    } else if (f.cmd === 'charge' && enemies.length === 0) { gx = f.x; gz = f.z; }
    const d = Math.hypot(gx - f.x, gz - f.z);
    if (d > 0.6) { f.mx = (gx - f.x) / d; f.mz = (gz - f.z) / d; f.run = d > 4; f.wantYaw = Math.atan2(f.mx, f.mz); }
    else if (player && f.team === player.team) f.wantYaw = player.yaw;
    return;
  }

  const d = dist(f, t);
  const toT = Math.atan2(t.x - f.x, t.z - f.z);
  f.wantYaw = toT;
  // himoya: nishon menga zarba tayyorlayapti
  const threat = ar.fighters.find(e => e.team !== f.team && e.state === 'windup' && dist(e, f) < REACH + 0.5 && Math.abs(angDiff(e.yaw, Math.atan2(f.x - e.x, f.z - e.z))) < 0.9);
  if (threat && f.reacted !== threat.attackSeq * 1000 + threat.id) {
    f.reacted = threat.attackSeq * 1000 + threat.id;
    if (ar.R() < f.skill && (f.state === 'idle' || f.state === 'block')) { f.blockUntil = ar.t + 0.75; f.wantYaw = Math.atan2(threat.x - f.x, threat.z - f.z); }
  }
  if (ar.t < f.blockUntil) { ar.block(f, true); }
  else if (f.state === 'block') ar.block(f, false);

  // atrofni o'rash: har kim nishon atrofida o'z burchagidan keladi
  const engaged = ar.fighters.filter(o => o.team === f.team && o.state !== 'dead' && o.target === t.id && dist(o, t) < 2.4).sort((a, b) => dist(a, t) - dist(b, t));
  const rank = engaged.indexOf(f);
  const waitRing = rank >= 3 || (rank === -1 && engaged.length >= 3);
  const want = waitRing ? 3.4 : 1.4;
  const off = ((f.id % 5) - 2) * 0.45;
  const ax = t.x - Math.sin(toT + off) * want, az = t.z - Math.cos(toT + off) * want;
  const gd = Math.hypot(ax - f.x, az - f.z);
  if (gd > 0.25) { f.mx = (ax - f.x) / gd; f.mz = (az - f.z) / gd; f.run = gd > 5; }
  if (d < 0.9) { f.mx = -Math.sin(toT); f.mz = -Math.cos(toT); }
  // hujum
  if (!waitRing && d < REACH - 0.1 && f.cd <= 0 && ar.t >= f.blockUntil && Math.abs(angDiff(f.yaw, toT)) < 0.45) {
    if (ar.attack(f)) f.cd = 0.8 + ar.R() * 1.3;
  }
}

/** buyruq berish (o'yinchi jamoasi) */
export function command(ar: Arena, team: 0 | 1, cmd: Fighter['cmd'], player: Fighter | null) {
  for (const f of ar.fighters) {
    if (f.team !== team || f.isPlayer || f.state === 'dead') continue;
    f.cmd = cmd; f.retgt = 0;
    if (cmd === 'hold') { f.homeX = f.x; f.homeZ = f.z; }
    if (cmd === 'retreat' && player) { f.homeX = player.x - Math.sin(player.yaw) * 8 + (f.slot % 5 - 2) * 1.3; f.homeZ = player.z - Math.cos(player.yaw) * 8; }
  }
}
