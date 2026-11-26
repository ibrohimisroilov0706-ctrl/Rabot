// apps/client/src/lord/battleView.ts
// Boshqariladigan jang ekrani: Battle dvigatelini chizadi, buyruq tugmalari, qahramonni bosish bilan yurgizish.
// Interaktiv bo'lmagan rejim (duel) - ikkala tomon AI, faqat tomosha va tezlashtirish.

import { unitFrame, FRAMES, FRAME_H, FRAME_W, type Pose } from '../art/soldiers.js';
import { drawBuilding } from '../art/buildings.js';
import { h } from '../dom.js';
import { haptic } from '../telegram.js';
import { Battle, FIELD_D, FIELD_W, WALL_X, type BattleResult, type BattleSetup, type BUnit, type Order } from './battle.js';
import { FACTIONS, troop, type Group } from './data.js';

const SKY: Record<string, [string, string]> = {
  ochiq: ['#5d97d1', '#d6ecff'], yomgir: ['#46525e', '#8f9ba5'], qor: ['#96a8ba', '#eef3f7'], tuman: ['#a3abb2', '#d9dde0'], jazirama: ['#e08f45', '#f7e0b2'],
};
const GROUND: Record<string, [string, string]> = {
  tekislik: ['#7fa04f', '#5e7f36'], ormon: ['#5a8441', '#3e6230'], tog: ['#8b8a74', '#6d6b58'], chol: ['#d9bf83', '#b99b5e'], daryo: ['#86a85a', '#62843d'],
};
const LADDERS = [55, 120, 185, 250];
const CLIMB_T = 2.6;
const TERRAIN_NAME: Record<string, string> = { tekislik: 'Tekislik', ormon: "O'rmon", tog: "Tog'", chol: "Cho'l", daryo: 'Daryo bo\'yi' };
const WEATHER_NAME: Record<string, string> = { ochiq: 'Ochiq', yomgir: "Yomg'ir", qor: 'Qor', tuman: 'Tuman', jazirama: 'Jazirama' };

export function openLordBattle(setup: BattleSetup, opts: { interactive: boolean; title: string; mySide?: 0 | 1 }): Promise<BattleResult> {
  return new Promise(resolve => {
    const b = new Battle(setup);
    const mySide = opts.mySide ?? 0;
    const root = h('div', { class: 'battle-overlay lb' });
    const canvas = h('canvas', {}) as HTMLCanvasElement;
    root.append(canvas);
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, narrow = true, zoom = 1, base = 1, yFar = 0, yNear = 0, skew = 0;
    const bg = document.createElement('canvas');
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight; narrow = W < 640;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      zoom = W / (narrow ? 470 : 920); base = Math.max(0.7, Math.min(1.4, zoom * 1.2));
      yFar = H * 0.31; yNear = H * (opts.interactive ? 0.78 : 0.88); skew = W * (narrow ? 0.3 : 0.22);
      drawBg();
    };

    // ---- DOM boshqaruvi
    const top = h('div', { class: 'bt-top' });
    const barL = h('div', { class: 'bt-side l' }), barR = h('div', { class: 'bt-side r' });
    const mid = h('div', { class: 'bt-mid' }, opts.title);
    top.append(barL, mid, barR);
    root.append(top);
    let group: Group | 'all' = 'all';
    let speed = 1; let followCam = true; let camX = setup.siege ? 700 : 700;
    const ctl = h('div', { class: 'bt-ctl' });
    const speedBtn = h('button', { class: 'bt-b', onClick: () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; speedBtn.textContent = `⏩ x${speed}`; } }, '⏩ x1');
    if (opts.interactive) {
      const groups: [Group | 'all', string][] = [['all', '👥 Hammasi'], ['inf', '🛡 Piyoda'], ['arch', '🏹 Kamonchi'], ['cav', '🐎 Otliq']];
      const gRow = h('div', { class: 'bt-row' });
      const gBtns = groups.map(([g, l]) => { const x = h('button', { class: `bt-g ${g === group ? 'on' : ''}`, onClick: () => { group = g; gBtns.forEach(bb => bb.classList.remove('on')); x.classList.add('on'); } }, l); return x; });
      gRow.append(...gBtns);
      const orders: [Order, string][] = [['charge', '⚔ Hujum'], ['hold', '✋ Turing'], ['advance', '➡ Oldinga'], ['retreat', '⬅ Orqaga']];
      const oRow = h('div', { class: 'bt-row' }, ...orders.map(([o, l]) => h('button', { class: `bt-o ${o}`, onClick: () => { b.ai[mySide] = false; autoBtn.classList.remove('on'); b.command(mySide, group, o); haptic('light'); flash(l); } }, l)));
      const autoBtn = h('button', { class: 'bt-b', onClick: () => { b.ai[mySide] = !b.ai[mySide]; autoBtn.classList.toggle('on', b.ai[mySide]); } }, '🤖 Avto');
      let armed = 0;
      const retreat = h('button', { class: 'bt-b red', onClick: () => {
        if (Date.now() - armed < 3000) { b.retreat(mySide); return; }
        armed = Date.now(); retreat.textContent = '🏳 Tasdiqlang'; setTimeout(() => { retreat.textContent = '🏳 Chekinish'; }, 3000);
      } }, '🏳 Chekinish');
      const camBtn = h('button', { class: 'bt-b', onClick: () => { followCam = true; } }, '🎯');
      ctl.append(gRow, oRow, h('div', { class: 'bt-row' }, autoBtn, speedBtn, camBtn, retreat));
    } else {
      const skip = h('button', { class: 'bt-b', onClick: () => { let g = 0; while (!b.result && g++ < 40000) b.step(1 / 30); } }, '⏭ Natija');
      ctl.append(h('div', { class: 'bt-row' }, speedBtn, skip));
    }
    root.append(ctl);
    const hint = h('div', { class: 'bt-hint' }, opts.interactive ? 'Maydonga bosing — qahramoningiz o‘sha yerga boradi. Pastdagi tugmalar bilan qo‘shinga buyruq bering.' : 'Do‘stona jang: ikkala qo‘shin o‘zi jang qiladi');
    root.append(hint); setTimeout(() => hint.classList.add('out'), 4500);
    const flashEl = h('div', { class: 'bt-flash' }); root.append(flashEl);
    const flash = (t: string) => { flashEl.textContent = t; flashEl.classList.remove('show'); void flashEl.offsetWidth; flashEl.classList.add('show'); };
    document.body.append(root);
    resize(); window.addEventListener('resize', resize);

    // ---- proyeksiya
    const depthK = (y: number) => y / FIELD_D;
    const sc = (y: number) => base * (0.68 + 0.32 * depthK(y));
    const sy = (y: number) => yFar + (yNear - yFar) * depthK(y);
    const sx = (x: number, y: number) => W / 2 + (x - camX) * zoom * (sc(y) / base) + (0.5 - depthK(y)) * skew;
    const wallH = (y: number) => 96 * sc(y);

    // ---- kamera surish va bosish
    let drag: { x: number; sx: number; moved: boolean; cam: number } | null = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, sx: e.clientX, moved: false, cam: camX }; });
    canvas.addEventListener('pointermove', e => { if (!drag) return; if (Math.abs(e.clientX - drag.sx) > 10) { drag.moved = true; followCam = false; } if (drag.moved) camX = Math.max(0, Math.min(FIELD_W, drag.cam - (e.clientX - drag.sx) / zoom)); });
    canvas.addEventListener('pointerup', e => {
      if (drag && !drag.moved && opts.interactive) {
        const yy = Math.max(0, Math.min(FIELD_D, (e.clientY - yFar) / (yNear - yFar) * FIELD_D));
        const xx = camX + (e.clientX - W / 2 - (0.5 - depthK(yy)) * skew) / (zoom * sc(yy) / base);
        b.moveHero(xx, yy); tapMark = { x: xx, y: yy, t: performance.now() }; followCam = true; heroFocus = performance.now() + 4000;
      }
      drag = null;
    });
    let tapMark: { x: number; y: number; t: number } | null = null;
    let heroFocus = 0;

    // ---- fon
    function drawBg() {
      bg.width = W * dpr; bg.height = H * dpr;
      const c = bg.getContext('2d')!; c.scale(dpr, dpr);
      const [s1, s2] = SKY[setup.weather] ?? SKY.ochiq!;
      const g = c.createLinearGradient(0, 0, 0, yFar); g.addColorStop(0, s1); g.addColorStop(1, s2);
      c.fillStyle = g; c.fillRect(0, 0, W, yFar + 4);
      if (setup.weather === 'ochiq' || setup.weather === 'jazirama') { c.fillStyle = 'rgba(255,248,215,.9)'; c.beginPath(); c.arc(W * 0.2, yFar * 0.3, Math.min(W, H) * 0.06, 0, Math.PI * 2); c.fill(); }
      let seed = 7;
      const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const hills = (yb: number, amp: number, col: string, step: number) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, yFar + 2);
        for (let x = 0; x <= W + step; x += step) c.lineTo(x, yb - R() * amp);
        c.lineTo(W, yFar + 2); c.closePath(); c.fill();
      };
      const ter = setup.terrain;
      if (ter === 'tog') { hills(yFar - 10, yFar * 0.45, '#7d8592', 70); hills(yFar, yFar * 0.25, '#6a705e', 50); }
      else if (ter === 'chol') { hills(yFar, yFar * 0.12, '#e2c890', 90); }
      else { hills(yFar, yFar * 0.16, '#6b8a5a', 60); }
      if (ter === 'ormon') { for (let x = 0; x < W; x += 9) { const hh = 18 + R() * 22; c.fillStyle = '#2f5130'; c.beginPath(); c.moveTo(x, yFar + 2); c.lineTo(x + 6, yFar - hh); c.lineTo(x + 12, yFar + 2); c.fill(); } }
      const [g1, g2] = GROUND[ter] ?? GROUND.tekislik!;
      const gg = c.createLinearGradient(0, yFar, 0, H); gg.addColorStop(0, g1); gg.addColorStop(1, g2);
      c.fillStyle = gg; c.fillRect(0, yFar, W, H - yFar);
      c.globalAlpha = 0.18; for (let i = 0; i < 260; i++) { const y = yFar + R() * (H - yFar); c.fillStyle = R() > 0.5 ? '#ffffff' : '#000000'; c.fillRect(R() * W, y, 2 + (y - yFar) / 60, 1); } c.globalAlpha = 1;
    }

    // ---- sahna
    const sparks: { x: number; y: number; t: number }[] = [];
    const weatherP = Array.from({ length: setup.weather === 'yomgir' ? 120 : setup.weather === 'qor' ? 90 : 0 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
    let keep: HTMLCanvasElement | null = null;
    function drawKeep(c: CanvasRenderingContext2D) {
      if (!keep) { keep = drawBuilding(document.createElement('canvas'), setup.sides[1].cu, 'saroy', 8); }
      const x = sx(WALL_X + 230, 40), y = sy(40), s = sc(40) * 1.9;
      c.drawImage(keep, x - 80 * s, y - 150 * s, 160 * s, 160 * s);
      const x2 = sx(WALL_X + 160, 230), y2 = sy(230), s2 = sc(230) * 1.2;
      c.drawImage(keep, x2 - 80 * s2, y2 - 140 * s2, 160 * s2, 160 * s2);
    }
    const TW = 56; // devor qalinligi
    function drawWall(c: CanvasRenderingContext2D) {
      const P = (x: number, y: number, up: number) => [sx(x, y), sy(y) - up] as const;
      const hF = wallH(0), hN = wallH(FIELD_D);
      const poly = (pts: (readonly [number, number])[], col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill(); };
      // old yuz (hujumchilarga qaragan)
      poly([P(WALL_X, 0, 0), P(WALL_X, FIELD_D, 0), P(WALL_X, FIELD_D, hN), P(WALL_X, 0, hF)], '#8c7552');
      // tosh qatorlari
      c.strokeStyle = 'rgba(50,35,20,0.28)'; c.lineWidth = 1;
      for (let k = 1; k < 7; k++) { const a = P(WALL_X, 0, hF * k / 7), b2 = P(WALL_X, FIELD_D, hN * k / 7); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
      for (let y = 10; y < FIELD_D; y += 16) for (let k = 0; k < 7; k++) { const a = P(WALL_X, y + (k % 2) * 8, wallH(y) * k / 7), b2 = P(WALL_X, y + (k % 2) * 8, wallH(y) * (k + 1) / 7); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
      // tepa yo'lak
      poly([P(WALL_X, 0, hF), P(WALL_X, FIELD_D, hN), P(WALL_X + TW, FIELD_D, hN), P(WALL_X + TW, 0, hF)], '#b9a27a');
      // yaqin uchidagi yon yuz
      poly([P(WALL_X, FIELD_D, 0), P(WALL_X + TW, FIELD_D, 0), P(WALL_X + TW, FIELD_D, hN), P(WALL_X, FIELD_D, hN)], '#6f5c3f');
      // tishlar (old qirrada)
      c.fillStyle = '#9e865f';
      for (let y = 6; y < FIELD_D; y += 15) { const [x, yy] = P(WALL_X, y, wallH(y)); const s = sc(y); c.fillRect(x - 4 * s, yy - 11 * s, 8 * s, 11 * s); }
      // minoralar
      for (const y of [6, FIELD_D / 2, FIELD_D - 4]) {
        const s = sc(y); const [x, yy] = P(WALL_X + TW / 2, y, 0); const th = wallH(y) + 46 * s;
        c.fillStyle = '#7f6a49'; c.fillRect(x - 22 * s, yy - th, 44 * s, th);
        c.fillStyle = '#9a8360'; c.fillRect(x - 22 * s, yy - th, 14 * s, th);
        c.fillStyle = '#2b2118'; c.fillRect(x - 4 * s, yy - th + 18 * s, 8 * s, 14 * s);
        c.fillStyle = '#7d1f1f'; c.beginPath(); c.moveTo(x - 27 * s, yy - th); c.lineTo(x, yy - th - 34 * s); c.lineTo(x + 27 * s, yy - th); c.fill();
        c.strokeStyle = '#3b2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, yy - th - 34 * s); c.lineTo(x, yy - th - 54 * s); c.stroke();
        c.fillStyle = FACTIONS[setup.sides[1].cu].color; c.beginPath(); c.moveTo(x, yy - th - 54 * s); c.lineTo(x + 18 * s, yy - th - 48 * s); c.lineTo(x, yy - th - 42 * s); c.fill();
      }
      // narvonlar
      c.strokeStyle = '#5b3a1e';
      for (const y of LADDERS) { const s = sc(y); const [x, yy] = P(WALL_X, y, 0); const top = wallH(y); c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x - 30 * s, yy); c.lineTo(x - 2 * s, yy - top - 6 * s); c.moveTo(x - 20 * s, yy + 3); c.lineTo(x + 8 * s, yy - top - 3 * s); c.stroke(); c.lineWidth = 1.5 * s; for (let k = 1; k < 8; k++) { const f = k / 8; c.beginPath(); c.moveTo(x - 30 * s + 28 * s * f, yy - (top + 6 * s) * f); c.lineTo(x - 20 * s + 28 * s * f, yy + 3 - (top + 6 * s) * f); c.stroke(); } }
    }
    const lifted = (u: BUnit) => setup.siege && u.onWall && u.x >= WALL_X - 4 && u.x <= WALL_X + TW + 30;
    const lift = (u: BUnit) => (setup.siege ? (lifted(u) ? wallH(u.y) : u.climb > 0 ? wallH(u.y) * Math.min(1, u.climb / CLIMB_T) : 0) : 0);

    function drawUnitFig(c: CanvasRenderingContext2D, u: BUnit, now: number) {
      const s = sc(u.y); const x = sx(u.x, u.y); const y = sy(u.y) - lift(u);
      if (x < -60 || x > W + 60) return;
      const t = troop(u.tid);
      let pose: Pose = 'idle'; let fr = 0;
      if (u.dead) pose = 'dead';
      else if (u.act === 'walk' || u.climb > 0) { pose = 'walk'; fr = Math.floor((now / 110 + u.id) % FRAMES); }
      else if (u.act === 'attack') { pose = 'attack'; fr = Math.min(FRAMES - 1, Math.floor(u.actT / 0.5 * FRAMES)); }
      const img = unitFrame(t.cu, t.art, pose, fr, u.skin);
      const fw = FRAME_W * s, fh = FRAME_H * s;
      c.save(); c.translate(x, y); if (u.face < 0) c.scale(-1, 1);
      if (u.dead) c.globalAlpha = 0.85;
      c.drawImage(img, -fw / 2 + 4 * s, -fh + 6 * s, fw, fh);
      c.restore();
      if (u.hero && !u.dead) {
        c.strokeStyle = u.side === mySide ? '#f0c040' : '#ff6b5b'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(x, y, 18 * s, 6 * s, 0, 0, Math.PI * 2); c.stroke();
        const hp = u.hp / u.maxHp; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - 18 * s, y - 70 * s, 36 * s, 5); c.fillStyle = hp > 0.4 ? '#6fcf7f' : '#e05a4a'; c.fillRect(x - 18 * s, y - 70 * s, 36 * s * hp, 5);
        c.font = `${Math.round(12 * s + 4)}px system-ui`; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText('👑', x, y - 74 * s);
      }
    }

    function render(now: number) {
      const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      // kamera
      if (followCam) {
        const hero = b.heroOf(mySide);
        let target = camX;
        if (opts.interactive && hero && !hero.dead && (now < heroFocus || b.heroGoal)) target = hero.x + (mySide === 0 ? 80 : -80);
        else {
          let a = -1e9, d = 1e9; for (const u of b.units) { if (u.dead) continue; if (u.side === 0) a = Math.max(a, u.x); else d = Math.min(d, u.x); }
          target = a > -1e9 && d < 1e9 ? (a + d) / 2 : camX;
        }
        const half = (W / zoom) / 2;
        target = Math.max(half - 40, Math.min(FIELD_W - half + 40, target));
        camX += (target - camX) * 0.06;
      }
      c.drawImage(bg, 0, 0, W, H);
      // jasadlar avval, keyin tiriklar (chuqurlik bo'yicha)
      const dead = b.units.filter(u => u.dead), alive = b.units.filter(u => !u.dead);
      for (const u of dead) drawUnitFig(c, u, now);
      const byY = (a: BUnit, bb: BUnit) => a.y - bb.y;
      if (setup.siege) {
        drawKeep(c);
        for (const u of alive.filter(u => u.x >= WALL_X && !lifted(u)).sort(byY)) drawUnitFig(c, u, now);
        drawWall(c);
        for (const u of alive.filter(u => lifted(u)).sort(byY)) drawUnitFig(c, u, now);
        for (const u of alive.filter(u => u.x < WALL_X && !lifted(u)).sort(byY)) drawUnitFig(c, u, now);
      } else for (const u of alive.sort(byY)) drawUnitFig(c, u, now);
      // o'qlar
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.3;
      for (const p of b.projs) {
        const k = p.t / p.dur; const x0 = sx(p.x0, p.y0), x1 = sx(p.x1, p.y1);
        const y0 = sy(p.y0) - 28 * sc(p.y0), y1 = sy(p.y1) - 20 * sc(p.y1);
        const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * 50 * sc(p.y1);
        const k2 = Math.min(1, k + 0.05); const xn = x0 + (x1 - x0) * k2, yn = y0 + (y1 - y0) * k2 - Math.sin(Math.PI * k2) * 50 * sc(p.y1);
        const dx = xn - x, dy = yn - y, L = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        c.beginPath(); c.moveTo(x - dx / L * 9, y - dy / L * 9); c.lineTo(x, y); c.stroke();
      }
      // uchqunlar
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i]!; const age = (now - sp.t) / 350; if (age > 1) { sparks.splice(i, 1); continue; }
        c.fillStyle = `rgba(200,30,30,${0.7 * (1 - age)})`; c.beginPath(); c.arc(sx(sp.x, sp.y), sy(sp.y) - 22 * sc(sp.y) - age * 8, 2.5 + age * 3, 0, Math.PI * 2); c.fill();
      }
      if (tapMark && now - tapMark.t < 900) { const k = (now - tapMark.t) / 900; c.strokeStyle = `rgba(255,230,140,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.ellipse(sx(tapMark.x, tapMark.y), sy(tapMark.y), 10 + k * 16, 4 + k * 6, 0, 0, Math.PI * 2); c.stroke(); }
      // ob-havo
      if (weatherP.length) {
        c.strokeStyle = 'rgba(220,230,255,.5)'; c.fillStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1;
        for (const p of weatherP) {
          p.y += setup.weather === 'yomgir' ? 0.02 * p.s : 0.004 * p.s; if (p.y > 1) { p.y = 0; p.x = Math.random(); }
          if (setup.weather === 'yomgir') { c.beginPath(); c.moveTo(p.x * W, p.y * H); c.lineTo(p.x * W - 3, p.y * H + 12 * p.s); c.stroke(); }
          else { p.x += Math.sin(now / 900 + p.s * 9) * 0.0006; c.beginPath(); c.arc(p.x * W, p.y * H, 1.6 * p.s, 0, Math.PI * 2); c.fill(); }
        }
      }
      if (setup.weather === 'tuman') { c.fillStyle = 'rgba(220,225,230,0.28)'; c.fillRect(0, 0, W, H); }
      // yuqori panel
      const tot = (s: 0 | 1) => setup.sides[s].stacks.reduce((a, x) => a + x.n, 0) + (setup.sides[s].hero ? 1 : 0);
      const side = (s: 0 | 1, el: HTMLElement) => {
        const n = b.total(s), t0 = Math.max(1, tot(s));
        el.innerHTML = `<b>${setup.sides[s].name}</b><span>${n}</span><i style="width:${Math.round(n / t0 * 100)}%;background:${setup.sides[s].color ?? FACTIONS[setup.sides[s].cu].color}"></i>`;
      };
      side(0, barL); side(1, barR);
    }

    // ---- sikl
    let last = performance.now(), acc = 0, raf = 0, done = false;
    const DT = 1 / 30;
    const loop = (now: number) => {
      const real = Math.min(0.1, (now - last) / 1000); last = now;
      acc += real * speed;
      let n = 0;
      while (acc >= DT && n < 12 && !b.result) { b.step(DT); acc -= DT; n++; for (const e of b.events) if (e.kind === 'hit' && sparks.length < 80) sparks.push({ x: e.x, y: e.y, t: now }); }
      render(now);
      if (b.result && !done) { done = true; setTimeout(() => showResult(b.result!), 700); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __lordBattle?: Battle }).__lordBattle = b;

    function showResult(r: BattleResult) {
      haptic(r.winner === mySide ? 'success' : 'error');
      const won = r.winner === mySide;
      const rows = (s: 0 | 1) => {
        const lost = r.lost[s];
        const list = setup.sides[s].stacks.map(st => h('div', { class: 'br-row' }, h('span', {}, troop(st.id).name), h('b', {}, `${st.n}`), lost[st.id] ? h('span', { class: 'neg' }, `−${lost[st.id]}`) : h('span', {}, '')));
        return h('div', {}, h('h4', {}, setup.sides[s].name), ...list, setup.sides[s].hero ? h('div', { class: 'br-row' }, h('span', {}, '👑 Qahramon'), h('b', {}, r.heroDown[s] ? 'yiqildi' : 'safda')) : null);
      };
      const panel = h('div', { class: 'battle-result' },
        h('h2', {}, won ? '🏆 G‘alaba!' : r.retreated && r.winner !== mySide ? '🏳 Chekindingiz' : '💀 Mag‘lubiyat'),
        h('div', { class: 'muted' }, `${TERRAIN_NAME[setup.terrain] ?? ''} · ${WEATHER_NAME[setup.weather] ?? ''} · ${Math.round(r.time)} soniya`),
        h('div', { class: 'br-cols' }, rows(0), rows(1)),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn gold', onClick: () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); root.remove(); resolve(r); } }, 'Davom etish')));
      root.append(panel);
      ctl.classList.add('hidden');
    }
  });
}
