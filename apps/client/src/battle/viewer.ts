// apps/client/src/battle/viewer.ts
// Jang sahnasi: saqlangan jang natijasini (yo'qotishlar, terren, ob-havo, devor) animatsiyali "kino" qilib ko'rsatadi.
// Hammasi natijaga asoslanadi: ekranda yiqilganlar soni = haqiqiy yo'qotishlar ulushi. Kino ~10 soniya, o'tkazib yuborish mumkin.

import { rng, unitDef, wallMaxHp, type Culture } from '@qirolliklar/game-rules';
import { drawBuilding } from '../art/buildings.js';
import { LOOK, shade, unitFrame, FRAME_H, FRAME_W, FRAMES, type Pose } from '../art/soldiers.js';
import { h } from '../dom.js';
import { CULTURE_NAME, RES, TERRAIN_NAME, UNIT_ICON, WEATHER_NAME } from '../i18n.js';
import { haptic } from '../telegram.js';

export interface BattleData {
  id: string; winner: 'attacker' | 'defender'; ratio: number; terrain: string; weather: string;
  wall_hp_before: number; wall_hp_after: number; attacker_name: string; defender_name: string; city_name?: string;
  attacker_culture?: Culture; defender_culture?: Culture; attacker_kingdom_id?: string; loot?: Record<string, number>;
  records: { side: 'attacker' | 'defender'; unit: string; before: number; lost: number }[];
}

type Side = 'attacker' | 'defender';
interface Fig { side: Side; unit: string; cls: string; cu: Culture; x0: number; xf: number; xc: number; y: number; s: number; skin: number; ph: number; deathAt: number; onWall: boolean; speed: number }
interface Shot { from: Fig; tx: number; ty: number; t0: number; dur: number; stone: boolean; wallHit: boolean }

const T_FORM = 1.6, T_RANGED = 1.8, T_CHARGE = 3.8, T_MELEE = 5.2, T_END = 8.6, T_RESULT = 10;
const SKY: Record<string, [string, string]> = {
  ochiq: ['#6fa8dc', '#dcefff'], yomgir: ['#4d5b68', '#97a3ad'], qor: ['#9fb0c0', '#eef3f7'], tuman: ['#a9b0b6', '#d9dde0'], jazirama: ['#e89b4f', '#f7e0b2'],
};
const GROUND: Record<string, string> = { tekislik: '#8fae5b', ormon: '#5f8a45', tog: '#8a8a7a', chol: '#d8bf85', daryo: '#86a85a' };

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
const ease = (k: number) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };

export function openBattle(b: BattleData, opts: { mySide?: Side } = {}) {
  const root = h('div', { class: 'battle-overlay' });
  const canvas = h('canvas', {}) as HTMLCanvasElement;
  const skip = h('button', { class: 'battle-skip' }, 'O‘tkazish ⏭');
  const close = h('button', { class: 'battle-close', 'aria-label': 'Yopish' }, '✕');
  const panel = h('div', { class: 'battle-result hidden' });
  root.append(canvas, skip, close, panel);
  document.body.append(root);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const ctx = canvas.getContext('2d')!;
  const resize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; };
  resize();

  const cuA: Culture = b.attacker_culture ?? 'temuriy', cuD: Culture = b.defender_culture ?? 'mogul';
  const fortified = b.wall_hp_before > 0;
  const R = rng(`view:${b.id}`);
  const narrow = W < 600;
  const horizon = H * 0.44, y0 = H * 0.56, y1 = H * 0.88;
  const base = narrow ? Math.min(W / 300, H / 620) : Math.min(W / 420, H / 760) * 1.15;
  const wallX = W * (narrow ? 0.79 : 0.84), wallTop = horizon + H * 0.03;
  const clashX = fortified ? W * (narrow ? 0.6 : 0.66) : W * 0.5;

  // ---- figuralar
  const maxFig = narrow ? 38 : 70;
  const totals = { attacker: 0, defender: 0 };
  for (const r of b.records) totals[r.side] += r.before;
  const k = Math.max(1, Math.ceil(Math.max(totals.attacker, totals.defender) / maxFig));
  const colOf = (cls: string) => (cls === 'piyoda' || cls === 'nayzachi' ? 0 : cls === 'otliq' || cls === 'ogir_otliq' ? 1 : cls === 'kamonchi' ? 2 : 3);
  const figs: Fig[] = [];
  const deathsBySide: Record<Side, Fig[]> = { attacker: [], defender: [] };
  for (const side of ['attacker', 'defender'] as Side[]) {
    const cu = side === 'attacker' ? cuA : cuD;
    const rows = new Map<number, number>();
    const stacks = b.records.filter(r => r.side === side && r.before > 0);
    for (const st of stacks) {
      const cls = unitDef(st.unit).cls;
      const n = Math.max(1, Math.round(st.before / k));
      const dead = st.lost >= st.before ? n : Math.min(n, Math.round(st.lost / k));
      const col = colOf(cls);
      const mine: Fig[] = [];
      for (let i = 0; i < n; i++) {
        const slot = rows.get(col) ?? 0; rows.set(col, slot + 1);
        const row = slot % 6, depthCol = Math.floor(slot / 6);
        const dk = row / 5;
        const y = lerp(y0, y1, dk) + (R() - 0.5) * 6;
        const s = base * (0.72 + 0.4 * dk) * (cls === 'otliq' || cls === 'ogir_otliq' ? 1.05 : 1);
        const spacing = 24 * base;
        const onWall = side === 'defender' && fortified && cls === 'kamonchi';
        let x0: number, xf: number, xc: number;
        if (side === 'attacker') {
          xf = W * (narrow ? 0.3 : 0.33) - col * spacing * 1.1 - depthCol * spacing * 0.8 + (R() - 0.5) * 8;
          x0 = xf - W * 0.45;
          xc = cls === 'kamonchi' || cls === 'qamal' ? xf + spacing * 0.5 : clashX - 10 * base - depthCol * spacing * 0.7 + (R() - 0.5) * 14;
        } else if (onWall) {
          xf = wallX + 6 * base + (slot % 5) * 14 * base; x0 = xf; xc = xf;
        } else {
          xf = (fortified ? W * (narrow ? 0.68 : 0.74) : W * 0.7) + col * spacing * 1.1 + depthCol * spacing * 0.8 + (R() - 0.5) * 8;
          x0 = xf + (fortified ? 0 : W * 0.4);
          xc = cls === 'kamonchi' || cls === 'qamal' ? xf : clashX + 10 * base + depthCol * spacing * 0.7 + (R() - 0.5) * 14;
        }
        const f: Fig = { side, unit: st.unit, cls, cu, x0, xf, xc, y: onWall ? wallTop - 2 : y, s: onWall ? base * 0.8 : s, skin: Math.floor(R() * 3), ph: R(), deathAt: Infinity, onWall, speed: 0.8 + R() * 0.4 };
        figs.push(f); mine.push(f);
      }
      // kim o'ladi: oldingi qatordagilar ko'proq
      mine.sort((a, bb) => (side === 'attacker' ? bb.xc - a.xc : a.xc - bb.xc) + (R() - 0.5) * 30);
      for (let i = 0; i < dead; i++) deathsBySide[side].push(mine[i]!);
    }
  }
  const ranged = (side: Side) => figs.some(f => f.side === side && (f.cls === 'kamonchi' || f.cls === 'qamal'));
  for (const side of ['attacker', 'defender'] as Side[]) {
    const list = deathsBySide[side];
    const early = ranged(side === 'attacker' ? 'defender' : 'attacker') ? Math.floor(list.length * 0.3) : 0;
    list.forEach((f, i) => { f.deathAt = i < early ? T_RANGED + 0.6 + R() * (T_CHARGE - T_RANGED) : T_MELEE + R() * (T_END - T_MELEE - 0.3); });
  }
  const loserSide: Side = b.winner === 'attacker' ? 'defender' : 'attacker';

  // ---- o'qlar va toshlar
  const shots: Shot[] = [];
  const enemiesOf = (side: Side) => figs.filter(f => f.side !== side);
  for (const f of figs) {
    if (f.cls !== 'kamonchi' && f.cls !== 'qamal') continue;
    const stone = f.cls === 'qamal';
    for (let t = T_RANGED + R() * 0.5; t < T_END - 0.5; t += stone ? 1.1 : 0.55 + R() * 0.3) {
      if (t >= f.deathAt) break;
      const wallHit = stone && fortified && f.side === 'attacker';
      const targets = enemiesOf(f.side).filter(e => e.deathAt > t + 0.8);
      const tg = targets[Math.floor(R() * targets.length)];
      if (!tg && !wallHit) continue;
      shots.push({ from: f, tx: wallHit ? wallX + R() * 30 * base : tg!.xc + (R() - 0.5) * 20, ty: wallHit ? wallTop + R() * H * 0.12 : tg!.y - 14 * base, t0: t, dur: stone ? 1.2 : 0.85, stone, wallHit });
    }
  }

  // ---- fon (bir marta chiziladi)
  const bg = document.createElement('canvas');
  const drawBg = () => {
    bg.width = W * dpr; bg.height = H * dpr;
    const c = bg.getContext('2d')!; c.scale(dpr, dpr);
    const [s1, s2] = SKY[b.weather] ?? SKY.ochiq!;
    const g = c.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, s1); g.addColorStop(1, s2);
    c.fillStyle = g; c.fillRect(0, 0, W, horizon + 2);
    if (b.weather === 'ochiq' || b.weather === 'jazirama') { c.fillStyle = b.weather === 'jazirama' ? 'rgba(255,220,150,.9)' : 'rgba(255,250,220,.9)'; c.beginPath(); c.arc(W * 0.18, H * 0.14, H * 0.05, 0, Math.PI * 2); c.fill(); }
    // uzoq relyef
    const r2 = rng(`bg:${b.id}`);
    const hills = (yBase: number, amp: number, col: string, jag: boolean) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, horizon + 4);
      for (let x = 0; x <= W + 40; x += jag ? 60 : 40) c.lineTo(x, yBase - r2() * amp - (jag ? (x / 60) % 2 * amp * 0.6 : 0));
      c.lineTo(W, horizon + 4); c.closePath(); c.fill();
    };
    if (b.terrain === 'tog') { hills(horizon - H * 0.05, H * 0.16, '#7d8590', true); c.fillStyle = '#f4f6f8'; } else if (b.terrain === 'chol') hills(horizon, H * 0.05, '#e4cc93', false);
    else hills(horizon, H * 0.06, b.terrain === 'ormon' ? '#3f6b3a' : '#7fa35a', false);
    if (b.terrain === 'ormon') for (let x = 0; x < W; x += 9) { c.fillStyle = '#2f5530'; c.beginPath(); c.moveTo(x, horizon + 2); c.lineTo(x + 5, horizon - 14 - r2() * 10); c.lineTo(x + 10, horizon + 2); c.fill(); }
    if (b.terrain === 'daryo') { c.fillStyle = '#4f86b8'; c.fillRect(0, horizon - 2, W, 8); }
    // yer
    const gc = GROUND[b.terrain] ?? GROUND.tekislik!;
    const gg = c.createLinearGradient(0, horizon, 0, H); gg.addColorStop(0, shade(gc, 0.9)); gg.addColorStop(1, shade(gc, 0.65));
    c.fillStyle = gg; c.fillRect(0, horizon, W, H - horizon);
    c.strokeStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 160; i++) { const x = r2() * W, y = horizon + r2() * (H - horizon); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y - 2); c.stroke(); }
    // qal'a
    if (fortified) {
      const palace = drawBuilding(document.createElement('canvas'), cuD, 'saroy', 6);
      const ph = H * 0.3; c.drawImage(palace, wallX + (W - wallX) / 2 - ph / 2, wallTop - ph * 0.9, ph, ph);
    }
  };
  drawBg();

  // ---- holat
  let t = 0, last = performance.now(), paused = false, raf = 0, shown = false, shakeUntil = 0;
  const posX = (f: Fig, tt: number) => {
    const td = Math.min(tt, f.deathAt);
    if (f.onWall) return f.xf;
    let x = lerp(f.x0, f.xf, ease(td / T_FORM));
    const chargeStart = f.cls === 'otliq' || f.cls === 'ogir_otliq' ? T_CHARGE : T_CHARGE + 0.4;
    if (td > chargeStart) x = lerp(f.xf, f.xc, ease((td - chargeStart) / ((T_MELEE - chargeStart) * f.speed)));
    if (tt > T_END && f.side === loserSide && f.deathAt === Infinity) x += (f.side === 'attacker' ? -1 : 1) * (tt - T_END) ** 1.6 * W * 0.25;
    return x;
  };
  const poseOf = (f: Fig, tt: number): [Pose, number, boolean] => {
    if (tt >= f.deathAt) return ['dead', 0, f.side === 'defender'];
    const fleeing = tt > T_END && f.side === loserSide;
    const facingLeft = f.side === 'defender' ? !fleeing : fleeing;
    const frame = Math.floor(((tt * (f.cls === 'otliq' || f.cls === 'ogir_otliq' ? 9 : 6)) + f.ph * FRAMES)) % FRAMES;
    if (fleeing) return ['walk', frame, facingLeft];
    const ranged = f.cls === 'kamonchi' || f.cls === 'qamal';
    if (tt < T_FORM && !f.onWall) return ['walk', frame, facingLeft];
    if (ranged && tt > T_RANGED && tt < T_END) return ['attack', Math.floor(((tt + f.ph) % 0.6) / 0.6 * FRAMES), facingLeft];
    if (!ranged && tt > T_CHARGE && tt < T_MELEE) return ['walk', frame, facingLeft];
    if (!ranged && tt >= T_MELEE && tt < T_END) return ['attack', Math.floor(((tt * 1.6 + f.ph) % 1) * FRAMES), facingLeft];
    return ['idle', 0, facingLeft];
  };
  const wallHp = (tt: number) => fortified ? lerp(b.wall_hp_before, b.wall_hp_after, (tt - T_RANGED) / (T_MELEE + 1 - T_RANGED)) : 0;
  const wallMax = fortified ? Math.max(b.wall_hp_before, wallMaxHp(1, cuD)) : 1;

  function drawWall(c: CanvasRenderingContext2D, tt: number) {
    if (!fortified) return;
    const L = LOOK[cuD];
    const stone = cuD === 'rus' ? '#b9876a' : cuD === 'temuriy' ? '#d2b98f' : cuD === 'mogul' ? '#9c8f7e' : '#b8b2a6';
    const hpK = wallHp(tt) / wallMax;
    const top = wallTop, bottom = y1 - (y1 - y0) * 0.35;
    c.fillStyle = shade(stone, 0.85); c.fillRect(wallX, top, W - wallX, bottom - top);
    c.fillStyle = stone; c.fillRect(wallX, top, 14 * base, bottom - top);
    for (let x = wallX; x < W; x += 12 * base) c.fillRect(x, top - 8 * base, 7 * base, 8 * base);
    c.strokeStyle = 'rgba(0,0,0,.12)';
    for (let y = top + 8; y < bottom; y += 9 * base) { c.beginPath(); c.moveTo(wallX, y); c.lineTo(W, y); c.stroke(); }
    // minoralar
    for (const tx of [wallX - 4 * base, W - 30 * base]) {
      c.fillStyle = shade(stone, 0.95); c.fillRect(tx, top - 34 * base, 30 * base, bottom - top + 34 * base);
      for (let i = 0; i < 3; i++) c.fillRect(tx + i * 11 * base, top - 42 * base, 7 * base, 8 * base);
      c.strokeStyle = '#3b2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(tx + 15 * base, top - 42 * base); c.lineTo(tx + 15 * base, top - 70 * base); c.stroke();
      c.fillStyle = L.trim; c.beginPath(); c.moveTo(tx + 15 * base, top - 70 * base); c.lineTo(tx + 15 * base + 20 * base * (1 + 0.1 * Math.sin(tt * 6)), top - 64 * base); c.lineTo(tx + 15 * base, top - 58 * base); c.fill();
    }
    // darvoza
    c.fillStyle = '#3b2716'; c.beginPath(); c.moveTo(wallX + 20 * base, bottom); c.lineTo(wallX + 20 * base, bottom - 30 * base); c.quadraticCurveTo(wallX + 34 * base, bottom - 44 * base, wallX + 48 * base, bottom - 30 * base); c.lineTo(wallX + 48 * base, bottom); c.fill();
    // shikast
    c.strokeStyle = 'rgba(30,20,10,.7)'; c.lineWidth = 1.5;
    const cracks = Math.floor((1 - hpK) * 9);
    const rc = rng(`crack:${b.id}`);
    for (let i = 0; i < cracks; i++) { let x = wallX + rc() * (W - wallX - 20), y = top + rc() * (bottom - top); c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rc() - 0.5) * 14; y += rc() * 10; c.lineTo(x, y); } c.stroke(); }
    if (hpK <= 0.01) { c.fillStyle = shade(GROUND[b.terrain] ?? '#8fae5b', 0.7); c.beginPath(); c.moveTo(wallX + 40 * base, top - 9 * base); c.lineTo(wallX + 70 * base, top + 30 * base); c.lineTo(wallX + 100 * base, top - 9 * base); c.fill(); for (let i = 0; i < 8; i++) { c.fillStyle = shade(stone, 0.7); c.fillRect(wallX + 30 * base + rc() * 80 * base, bottom - rc() * 14 * base, 8 * base, 6 * base); } }
    // HP chizig'i
    const hy = H * 0.12 + 44;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W / 2 - 60, hy, 120, 10); c.fillStyle = hpK > 0.4 ? '#6fcf7f' : '#e0a040'; c.fillRect(W / 2 - 58, hy + 2, 116 * hpK, 6);
    c.fillStyle = '#fff'; c.font = '11px system-ui'; c.textAlign = 'center'; c.fillText(`🧱 Devor ${Math.round(wallHp(tt))}`, W / 2, hy + 22);
  }

  function weather(c: CanvasRenderingContext2D, tt: number) {
    const rw = rng(`w:${b.id}`);
    if (b.weather === 'yomgir') { c.strokeStyle = 'rgba(200,215,235,.45)'; c.lineWidth = 1; for (let i = 0; i < 120; i++) { const x = (rw() * W + tt * 260) % W, y = (rw() * H + tt * 700) % H; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 12); c.stroke(); } }
    if (b.weather === 'qor') { c.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 110; i++) { const x = (rw() * W + Math.sin(tt + i) * 20) % W, y = (rw() * H + tt * 40) % H; c.beginPath(); c.arc(x, y, 1 + rw() * 1.5, 0, Math.PI * 2); c.fill(); } }
    if (b.weather === 'tuman') { for (let i = 0; i < 4; i++) { const g = c.createLinearGradient(0, 0, W, 0); const x = ((tt * 20 + i * W / 3) % (W * 1.5)) - W * 0.25; g.addColorStop(0, 'rgba(230,232,235,0)'); g.addColorStop(0.5, 'rgba(230,232,235,.35)'); g.addColorStop(1, 'rgba(230,232,235,0)'); c.fillStyle = g; c.fillRect(x - W * 0.3, horizon - 40 + i * 50, W * 0.6, 60); } }
    if (b.weather === 'jazirama') { c.fillStyle = 'rgba(255,170,80,.08)'; c.fillRect(0, 0, W, H); }
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) t += dt;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = t < shakeUntil ? (Math.random() - 0.5) * 6 : 0;
    c.drawImage(bg, 0, 0, W, H);
    c.save(); c.translate(shake, shake * 0.5);
    drawWall(c, t);
    // figuralar: chuqurlik bo'yicha
    const order = figs.slice().sort((a, bb) => a.y - bb.y);
    for (const f of order) {
      const [pose, fr, left] = poseOf(f, t);
      const x = posX(f, t);
      let alpha = 1;
      if (pose === 'dead') alpha = 0.85;
      if (t > T_END && f.side === loserSide && pose !== 'dead') alpha = Math.max(0, 1 - (t - T_END) / 1.4);
      if (alpha <= 0) continue;
      const img = unitFrame(f.cu, f.unit, pose, fr, f.skin);
      const w = FRAME_W * f.s, hh = FRAME_H * f.s;
      c.save(); c.globalAlpha = alpha; c.translate(x, f.y);
      if (left) c.scale(-1, 1);
      c.drawImage(img, -w / 2 + 4 * f.s, -hh + 6 * f.s, w, hh);
      c.restore();
    }
    // o'qlar va toshlar
    for (const s of shots) {
      const k = (t - s.t0) / s.dur;
      const fx = posX(s.from, s.t0), fy = s.from.y - 24 * s.from.s;
      if (k >= 1 && k < 1.6 && s.stone) {
        const r = (k - 1) * 40 * base; c.fillStyle = `rgba(160,140,110,${0.6 - (k - 1)})`; c.beginPath(); c.arc(s.tx, s.ty, r, 0, Math.PI * 2); c.fill();
        if (s.wallHit && k < 1.08) { shakeUntil = t + 0.15; }
      }
      if (k < 0 || k >= 1) continue;
      const x = lerp(fx, s.tx, k), arc = (s.stone ? 0.35 : 0.22) * Math.abs(s.tx - fx);
      const y = lerp(fy, s.ty, k) - Math.sin(k * Math.PI) * arc;
      const nx = lerp(fx, s.tx, k + 0.02), ny = lerp(fy, s.ty, k + 0.02) - Math.sin((k + 0.02) * Math.PI) * arc;
      if (s.stone) { c.fillStyle = s.from.unit === 'shohi_top' ? '#222' : '#6d6a66'; c.beginPath(); c.arc(x, y, 3.2 * base, 0, Math.PI * 2); c.fill(); }
      else { const a = Math.atan2(ny - y, nx - x); c.strokeStyle = '#3b2a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(a) * 9 * base, y - Math.sin(a) * 9 * base); c.stroke(); }
    }
    // qo'l jangi uchqunlari
    if (t > T_MELEE && t < T_END) {
      c.strokeStyle = 'rgba(255,230,120,.9)'; c.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) { const x = clashX + (Math.random() - 0.5) * 40 * base, y = lerp(y0, y1, Math.random()) - 20 * base; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10); c.stroke(); }
      if (Math.random() < 0.08) shakeUntil = t + 0.06;
    }
    c.restore();
    weather(c, t);
    // sarlavha va bosqich yozuvi
    c.fillStyle = 'rgba(11,31,56,.75)'; c.fillRect(0, 0, W, 46);
    c.font = `600 ${Math.max(13, 15 * base)}px Georgia, serif`; c.textBaseline = 'middle';
    c.fillStyle = LOOK[cuA].trim; c.textAlign = 'left'; c.fillText(b.attacker_name, 12, 23);
    c.fillStyle = '#f6efe0'; c.textAlign = 'center'; c.fillText('⚔', W / 2, 23);
    c.fillStyle = LOOK[cuD].trim; c.textAlign = 'right'; c.fillText(b.city_name ?? b.defender_name, W - 12, 23);
    const caption = t < T_FORM ? 'Qo‘shinlar saf tortmoqda' : t < T_CHARGE ? (fortified ? 'Qamal: toshlar va o‘qlar!' : 'O‘q yomg‘iri!') : t < T_MELEE ? 'Hujum!' : t < T_END ? 'Qo‘l jangi' : (b.winner === 'attacker' ? `${b.attacker_name} g‘olib!` : `${b.defender_name} g‘olib!`);
    const cy = H * 0.12;
    c.font = `700 ${Math.round(Math.min(30, Math.max(20, 22 * base)))}px Georgia, serif`; c.textAlign = 'center';
    c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(caption, W / 2, cy); c.fillStyle = t > T_END ? '#f0d58a' : '#fff'; c.fillText(caption, W / 2, cy);
    c.font = '13px system-ui'; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(`${TERRAIN_NAME[b.terrain] ?? b.terrain} · ${WEATHER_NAME[b.weather] ?? b.weather}`, W / 2, cy + 26);
    if (t >= T_RESULT && !shown) showResult();
    raf = requestAnimationFrame(frame);
  }

  function showResult() {
    shown = true;
    const iWon = opts.mySide ? b.winner === opts.mySide : b.winner === 'attacker';
    haptic(iWon ? 'success' : 'error');
    const side = (s: Side) => b.records.filter(r => r.side === s && r.before > 0).map(r => h('div', { class: 'br-row' }, h('span', {}, `${UNIT_ICON[r.unit] ?? '•'} ${unitDef(r.unit).name}`), h('b', {}, `${r.before} → ${r.before - r.lost}`), r.lost ? h('small', { class: 'neg' }, ` −${r.lost}`) : null));
    const parts: (HTMLElement | null)[] = [
      h('h2', {}, iWon ? '🏆 G‘alaba!' : '💀 Mag‘lubiyat'),
      h('p', { class: 'muted small' }, `Kuch nisbati ${Number(b.ratio).toFixed(2)} · ${CULTURE_NAME[cuA]} ⚔ ${CULTURE_NAME[cuD]}`),
      h('div', { class: 'br-cols' }, h('div', {}, h('h4', {}, b.attacker_name), ...side('attacker')), h('div', {}, h('h4', {}, b.defender_name), ...side('defender'))),
      b.loot && Object.values(b.loot).some(v => v) ? h('p', {}, 'O‘lja: ', Object.entries(b.loot).filter(([, v]) => v).map(([k2, v]) => `${RES[k2 as keyof typeof RES]?.icon ?? k2} ${Math.floor(v)}`).join('  ')) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => { t = 0; shown = false; panel.classList.add('hidden'); } }, '↻ Qayta ko‘rish'), h('button', { class: 'btn gold', onClick: destroy }, 'Yopish')),
    ];
    panel.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
    panel.classList.remove('hidden');
  }
  function destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); root.remove(); }
  const onResize = () => { resize(); drawBg(); };
  window.addEventListener('resize', onResize);
  skip.addEventListener('click', () => { t = T_RESULT; });
  close.addEventListener('click', destroy);
  haptic('heavy');
  raf = requestAnimationFrame(frame);
  // testlar uchun: aniq vaqtga o'tish
  (window as unknown as { __battleSeek?: (x: number) => void }).__battleSeek = (x: number) => { t = x; paused = true; };
  return destroy;
}
