// apps/client/src/g3d/game3d.ts
// 1-bosqich o'ynaladigan 3D sinov maydoni: uchinchi shaxs kamerasi, qahramon, ittifoqchi va dushman askarlar,
// 3 to'lqinli jang, HUD (sog'liq, chidamlilik, qurol, ot holati, minikarta, buyruqlar), pauza va natija.

import { h } from '../dom.js';
import { haptic, setBack } from '../telegram.js';
import { command, updateAI } from './ai.js';
import { drawCharacter, partsFor } from './character.js';
import { CIVS, CIV_LIST, type CivKey } from './civs.js';
import { Arena, type Cmd, type Fighter } from './combat.js';
import { Renderer } from './engine/gl.js';
import { angDiff, clamp, compose, mat4 } from './engine/math.js';
import { buildScene, envAt, heightAt } from './scene.js';
import { loadProfile, saveProfile } from './settings.js';

interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; col: [number, number, number] }
const WAVES = [{ n: 5, skill: 0.25, hero: false }, { n: 7, skill: 0.38, hero: true }, { n: 9, skill: 0.5, hero: true }];
const CMD_LABEL: Record<Cmd, string> = { follow: '🚩 Ergashing', charge: '⚔ Hujum', hold: '✋ Turing', retreat: '⬅ Orqaga' };

export function startBattle3D(opts: { civ: CivKey; enemy?: CivKey; onExit: () => void }) {
  const prof = loadProfile(); const S = prof.settings;
  const enemyCiv: CivKey = opts.enemy ?? CIV_LIST.filter(c => c !== opts.civ)[Math.floor(Math.random() * 5)]!;
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ---------------- DOM
  const root = h('div', { class: 'g3' });
  const canvas = h('canvas', { class: 'g3-canvas' }) as HTMLCanvasElement;
  const overlay = h('canvas', { class: 'g3-over' }) as HTMLCanvasElement;
  root.append(canvas, overlay);
  const hpBar = h('i'), stBar = h('i');
  const bars = h('div', { class: 'g3-bars' },
    h('div', { class: 'g3-bar hp' }, hpBar, h('span', {}, '❤')),
    h('div', { class: 'g3-bar st' }, stBar, h('span', {}, '⚡')),
    h('div', { class: 'g3-status' }, h('span', {}, '🗡 Qilich + qalqon'), h('span', { class: 'dim' }, '🐎 Ot: 2-bosqichda')));
  const info = h('div', { class: 'g3-info' });
  const mini = h('canvas', { class: 'g3-mini', width: 240, height: 240 }) as HTMLCanvasElement;
  const pauseBtn = h('button', { class: 'g3-pause', onClick: () => pause() }, '⏸');
  const cmdBtns = (Object.keys(CMD_LABEL) as Cmd[]).map(c => h('button', { class: `g3-cmd ${c === 'follow' ? 'on' : ''}`, onClick: () => giveCmd(c) }, CMD_LABEL[c]));
  const cmds = h('div', { class: 'g3-cmds' }, ...cmdBtns);
  const atkBtn = h('button', { class: 'g3-btn atk' }, '⚔');
  const blkBtn = h('button', { class: 'g3-btn blk' }, '🛡');
  const runBtn = h('button', { class: 'g3-btn run' }, '🏃');
  const actions = h('div', { class: 'g3-actions' }, blkBtn, atkBtn, runBtn);
  const joy = h('div', { class: 'g3-joy hidden' }, h('i'));
  const toastEl = h('div', { class: 'g3-toast' });
  const hint = h('div', { class: 'g3-hint' }, isTouch
    ? 'Chap tomonda barmoq — yurish. O‘ng tomonda surish — kamera. ⚔ zarba, 🛡 bosib turing — to‘sish, 🏃 yugurish.'
    : 'WASD — yurish · Shift — yugurish · ekranni bosing, so‘ng sichqoncha bilan kamera · chap tugma yoki Probel — zarba · o‘ng tugma yoki Q — to‘sish · 1-4 buyruqlar · Esc — pauza');
  root.append(bars, info, mini, pauseBtn, cmds, joy, toastEl);
  if (isTouch) root.append(actions);
  if (S.showHints) { root.append(hint); setTimeout(() => hint.classList.add('out'), 7000); }
  document.body.append(root);

  let r: Renderer;
  try { r = new Renderer(canvas, S.quality); }
  catch (e) { root.remove(); alertBox((e as Error).message); opts.onExit(); return; }
  const sc = buildScene(r, opts.civ, enemyCiv);
  for (const c of [opts.civ, enemyCiv]) { partsFor(r, c, false); partsFor(r, c, true); }

  // ---------------- jang holati
  let ar: Arena, player: Fighter, wave = 0, waveTimer = 0, over = false, paused = false, kills0 = 0;
  const portrait = () => window.innerHeight > window.innerWidth;
  let camYaw = Math.PI, camPitch = 0.3, camDist = portrait() ? 6.2 : 4.8;
  let dayT = 0.33;
  const sparks: Spark[] = [];
  let toastT = 0;
  const say = (t: string) => { toastEl.textContent = t; toastEl.classList.add('show'); toastT = 2.2; };

  function setup() {
    ar = new Arena(`3d:${Date.now()}`, heightAt);
    player = ar.spawn(0, opts.civ, 0, 20, { player: true });
    player.yaw = Math.PI;
    for (let i = 0; i < 5; i++) addAlly(i);
    wave = 0; over = false; kills0 = 0;
    spawnWave();
    camYaw = Math.PI;
    for (const b of cmdBtns) b.classList.toggle('on', b.textContent === CMD_LABEL.follow);
  }
  function addAlly(i: number) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const f = ar.spawn(0, opts.civ, player.x + side * (1.9 + (k % 3) * 1.3), player.z + 0.4 + Math.floor(k / 3) * 1.5, { skill: 0.4 });
    f.yaw = Math.PI; f.cmd = 'follow'; f.slot = ar.fighters.filter(o => o.team === 0 && !o.isPlayer).length - 1;
  }
  function spawnWave() {
    const W = WAVES[wave]!;
    for (let i = 0; i < W.n; i++) {
      const f = ar.spawn(1, enemyCiv, (i - W.n / 2) * 1.5, -22 - (i % 2) * 1.5, { skill: W.skill, hero: W.hero && i === 0 });
      f.yaw = 0; f.cmd = 'charge';
    }
    say(`${wave + 1}-to‘lqin: ${CIVS[enemyCiv].name} — ${W.n} jangchi${W.hero ? ' va sardor' : ''}!`);
  }
  function giveCmd(c: Cmd) {
    command(ar, 0, c, player);
    cmdBtns.forEach(b => b.classList.toggle('on', b.textContent === CMD_LABEL[c]));
    say(CMD_LABEL[c]); haptic('light');
  }

  // ---------------- boshqaruv
  const keys = new Set<string>();
  let joyId = -1, joyX0 = 0, joyY0 = 0, joyDX = 0, joyDY = 0;
  let lookId = -1, lookX = 0, lookY = 0;
  let blocking = false, sprint = false, wantAttack = false;
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.toLowerCase();
    if (down && k === 'escape') { pause(); return; }
    if (down && ['1', '2', '3', '4'].includes(k)) giveCmd((['follow', 'charge', 'hold', 'retreat'] as Cmd[])[Number(k) - 1]!);
    if (down) keys.add(k); else keys.delete(k);
    if ((k === ' ' || k === 'j') && down && !e.repeat) wantAttack = true;
    if (k === 'q' || k === 'k') blocking = down;
    if (k === 'shift') sprint = down;
  };
  const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const locked = () => document.pointerLockElement === canvas;
  canvas.addEventListener('mousedown', e => {
    if (isTouch) return;
    if (!locked()) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) wantAttack = true; else if (e.button === 2) blocking = true;
  });
  window.addEventListener('mouseup', e => { if (e.button === 2) blocking = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const onMouse = (e: MouseEvent) => { if (!locked()) return; camYaw -= e.movementX * 0.0035 * S.sens; camPitch = clamp(camPitch + e.movementY * 0.003 * S.sens * (S.invertY ? -1 : 1), -0.25, 1.0); };
  window.addEventListener('mousemove', onMouse);
  canvas.addEventListener('wheel', e => { camDist = clamp(camDist + Math.sign(e.deltaY) * 0.4, 2.6, 9); }, { passive: true });
  // sensorli ekran
  overlay.style.pointerEvents = 'none';
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    if (e.clientX < window.innerWidth * 0.45 && joyId < 0) { joyId = e.pointerId; joyX0 = e.clientX; joyY0 = e.clientY; joyDX = joyDY = 0; joy.classList.remove('hidden'); joy.style.left = `${joyX0}px`; joy.style.top = `${joyY0}px`; }
    else if (lookId < 0) { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === joyId) { joyDX = clamp((e.clientX - joyX0) / 55, -1, 1); joyDY = clamp((e.clientY - joyY0) / 55, -1, 1); (joy.firstChild as HTMLElement).style.transform = `translate(${joyDX * 38}px, ${joyDY * 38}px)`; }
    else if (e.pointerId === lookId) { camYaw -= (e.clientX - lookX) * 0.008 * S.sens; camPitch = clamp(camPitch + (e.clientY - lookY) * 0.006 * S.sens * (S.invertY ? -1 : 1), -0.25, 1.0); lookX = e.clientX; lookY = e.clientY; }
  });
  const endPtr = (e: PointerEvent) => {
    if (e.pointerId === joyId) { joyId = -1; joyDX = joyDY = 0; joy.classList.add('hidden'); (joy.firstChild as HTMLElement).style.transform = ''; }
    if (e.pointerId === lookId) lookId = -1;
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  const hold = (el: HTMLElement, on: () => void, off: () => void) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); on(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { el.classList.remove('down'); off(); });
  };
  hold(atkBtn, () => { wantAttack = true; }, () => {});
  hold(blkBtn, () => { blocking = true; }, () => { blocking = false; });
  runBtn.addEventListener('click', () => { sprint = !sprint; runBtn.classList.toggle('on', sprint); });

  function playerInput() {
    if (player.state === 'dead') { player.mx = player.mz = 0; return; }
    let ix = joyDX, iy = -joyDY;
    if (keys.has('w') || keys.has('arrowup') || keys.has('ц')) iy += 1;
    if (keys.has('s') || keys.has('arrowdown') || keys.has('ы')) iy -= 1;
    if (keys.has('a') || keys.has('arrowleft') || keys.has('ф')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright') || keys.has('в')) ix += 1;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    player.mx = fx * iy + rx * ix; player.mz = fz * iy + rz * ix;
    player.run = sprint && iy > 0.3;
    // yo'nalish: kamera tomonga; zarbada yaqin dushmanga avtomatik nishonlash
    let aim = camYaw;
    const near = ar.fighters.filter(e => e.team === 1 && e.state !== 'dead').map(e => ({ e, d: Math.hypot(e.x - player.x, e.z - player.z), a: Math.atan2(e.x - player.x, e.z - player.z) }))
      .filter(o => o.d < 2.9 && Math.abs(angDiff(camYaw, o.a)) < 0.85).sort((a, b) => a.d - b.d)[0];
    if (near && (player.state !== 'idle' || wantAttack || blocking)) aim = near.a;
    player.wantYaw = aim;
    if (wantAttack) { if (ar.attack(player)) haptic('light'); wantAttack = false; }
    ar.block(player, blocking);
  }

  // ---------------- pauza / natija
  let panel: HTMLElement | null = null;
  function pause() {
    if (over || panel) return;
    paused = true; if (locked()) document.exitPointerLock();
    panel = h('div', { class: 'g3-panel' }, h('h2', {}, '⏸ Pauza'),
      h('button', { class: 'btn gold wide', onClick: resume }, '▶ Davom etish'),
      h('button', { class: 'btn wide', onClick: () => { closePanel(); setup(); paused = false; } }, '↻ Qayta boshlash'),
      h('button', { class: 'btn wide', onClick: exit }, '🏠 Bosh menyu'));
    root.append(panel);
  }
  function resume() { closePanel(); paused = false; }
  function closePanel() { panel?.remove(); panel = null; }
  function finish(win: boolean) {
    over = true; if (locked()) document.exitPointerLock();
    const k = player.kills;
    prof.kills += k; if (win) prof.wins++; else prof.losses++; prof.best = Math.max(prof.best, k); saveProfile(prof);
    haptic(win ? 'success' : 'error');
    setTimeout(() => {
      panel = h('div', { class: 'g3-panel' }, h('h2', {}, win ? '🏆 G‘alaba!' : '💀 Mag‘lubiyat'),
        h('p', {}, win ? `Uchala to‘lqin yengildi. ${CIVS[enemyCiv].name} lageri qochdi.` : `Qahramoningiz ${wave + 1}-to‘lqinda yiqildi.`),
        h('p', {}, `Siz o‘ldirgan dushmanlar: ${k} · Ittifoqchilar: ${ar.fighters.filter(f => f.team === 0 && !f.isPlayer).reduce((a, f) => a + f.kills, 0)}`),
        h('p', { class: 'muted' }, `Jami: ${prof.kills} o‘ldirilgan · ${prof.wins} g‘alaba · rekord ${prof.best}`),
        h('button', { class: 'btn gold wide', onClick: () => { closePanel(); setup(); } }, '↻ Yana jang'),
        h('button', { class: 'btn wide', onClick: exit }, '🏠 Bosh menyu'));
      root.append(panel);
    }, 1400);
  }
  let alive = true;
  function exit() {
    alive = false; setBack(null);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('mousemove', onMouse);
    if (locked()) document.exitPointerLock();
    root.remove(); opts.onExit();
  }
  setBack(() => { if (panel) resume(); else pause(); });

  // ---------------- chizish
  const oc = overlay.getContext('2d')!;
  const mc = mini.getContext('2d')!;
  const M = mat4();
  function render(dt: number) {
    const env = envAt(dayT);
    const ph = heightAt(player.x, player.z);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const tx = player.x - Math.cos(camYaw) * 0.45, tz = player.z + Math.sin(camYaw) * 0.45, ty = ph + 1.7;
    let ex = tx - fx * camDist * Math.cos(camPitch), ez = tz - fz * camDist * Math.cos(camPitch), ey = ty + camDist * Math.sin(camPitch);
    ey = Math.max(ey, heightAt(ex, ez) + 0.5);
    r.begin(env, [ex, ey, ez], [tx + fx * 2, ty - 0.2, tz + fz * 2], portrait() ? 1.2 : 0.95);
    const gl = r.gl;
    // osmon
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const sk = 0.25 + clamp(env.sun[1] * 1.3, 0, 0.75) + 0.05;
    r.draw(sc.sky, compose(M, ex, ey, ez), { unlit: true, tint: [Math.min(1, sk + env.fog[0] * 0.2), Math.min(1, sk), Math.min(1, sk + 0.1)] });
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    compose(M, 0, 0, 0);
    r.draw(sc.terrain, M); r.draw(sc.props, M);
    // jangchilar
    for (const f of ar.fighters) {
      const d = Math.hypot(f.x - ex, f.z - ez);
      if (d > 90) continue;
      const pr = r.project(f.x, heightAt(f.x, f.z) + 1, f.z);
      if (!pr.vis) continue;
      const P = partsFor(r, f.civ, f.hero);
      drawCharacter(r, P, { x: f.x, y: heightAt(f.x, f.z), z: f.z, yaw: f.yaw, speed: f.speed, phase: f.phase, state: f.state, stateT: f.stateT, stateDur: f.stateDur, attack: f.attack, deadT: f.deadT }, f.flash > 0 ? 0.55 : 0, f.hero && !f.isPlayer ? 1.08 : 1);
    }
    for (const f of ar.fighters) { if (f.state === 'dead' && f.deadT > 0.7) continue; const y = heightAt(f.x, f.z) + 0.03; r.draw(sc.shadow, compose(M, f.x, y, f.z), { tint: [0, 0, 0], alpha: 0.28, unlit: true }); }
    // uchqunlar
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!; s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      r.draw(sc.spark, compose(M, s.x, s.y, s.z, 0, 0, 0, Math.max(0.2, s.life * 2.2)), { unlit: true, tint: s.col });
    }
    // 2D qatlam: sog'liq chiziqlari
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    if (overlay.width !== W * dpr) { overlay.width = W * dpr; overlay.height = H * dpr; }
    oc.setTransform(dpr, 0, 0, dpr, 0, 0); oc.clearRect(0, 0, W, H);
    for (const f of ar.fighters) {
      if (f.isPlayer || f.state === 'dead') continue;
      const d = Math.hypot(f.x - player.x, f.z - player.z); if (d > 22) continue;
      const p = r.project(f.x, heightAt(f.x, f.z) + 2.25, f.z); if (!p.vis) continue;
      const w = f.hero ? 46 : 34; const k = f.hp / f.maxHp;
      oc.fillStyle = 'rgba(0,0,0,.55)'; oc.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
      oc.fillStyle = f.team === 0 ? '#5fd17a' : '#e2533f'; oc.fillRect(p.x - w / 2, p.y, w * k, 4);
      if (f.hero) { oc.font = '12px system-ui'; oc.textAlign = 'center'; oc.fillText('👑', p.x, p.y - 4); }
      if (f.team === 1 && f.state === 'windup' && d < 4) { oc.fillStyle = '#ffd34d'; oc.font = 'bold 16px system-ui'; oc.textAlign = 'center'; oc.fillText('!', p.x, p.y - 6); }
    }
    // minikarta
    const MS = 240, RR = 40, cx = MS / 2, cy = MS / 2;
    mc.clearRect(0, 0, MS, MS);
    mc.save(); mc.beginPath(); mc.arc(cx, cy, MS / 2 - 4, 0, Math.PI * 2); mc.clip();
    mc.fillStyle = 'rgba(40,70,35,.85)'; mc.fillRect(0, 0, MS, MS);
    mc.translate(cx, cy); mc.rotate(camYaw - Math.PI);
    const sk2 = (MS / 2) / RR;
    mc.fillStyle = 'rgba(160,130,80,.8)'; mc.fillRect((0 - player.x) * sk2 - 3 * sk2, -200, 6 * sk2, 400);
    for (const f of ar.fighters) {
      if (f.isPlayer) continue;
      const dx = (f.x - player.x) * sk2, dz = (f.z - player.z) * sk2;
      mc.fillStyle = f.state === 'dead' ? 'rgba(0,0,0,.35)' : f.team === 0 ? '#7dff9a' : '#ff5a4a';
      mc.beginPath(); mc.arc(-dx, -dz, f.hero ? 6 : 4.5, 0, Math.PI * 2); mc.fill();
    }
    mc.restore();
    mc.fillStyle = '#ffd34d'; mc.beginPath(); mc.moveTo(cx, cy - 11); mc.lineTo(cx + 8, cy + 8); mc.lineTo(cx, cy + 3); mc.lineTo(cx - 8, cy + 8); mc.fill();
    mc.strokeStyle = 'rgba(212,165,55,.9)'; mc.lineWidth = 4; mc.beginPath(); mc.arc(cx, cy, MS / 2 - 4, 0, Math.PI * 2); mc.stroke();
  }

  function hud() {
    hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    stBar.style.width = `${(player.stam / player.maxStam) * 100}%`;
    const en = ar.alive(1).length, al = ar.alive(0).length - (player.state === 'dead' ? 0 : 1);
    info.textContent = `${Math.min(wave + 1, WAVES.length)}/${WAVES.length}-to‘lqin · ⚔ dushman ${en} · 🛡 sizniki ${al} · 💀 ${player.kills}`;
  }

  // ---------------- asosiy sikl
  setup();
  let last = performance.now();
  (window as unknown as { __g3?: unknown }).__g3 = { get ar() { return ar; }, get player() { return player; }, setCam: (y: number, p: number) => { camYaw = y; camPitch = p; } };
  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) {
      playerInput();
      for (const f of ar.fighters) updateAI(ar, f, dt, player);
      ar.step(dt);
      for (const e of ar.events) {
        const y = heightAt(e.x, e.z) + 1.3;
        const col: [number, number, number] = e.k === 'hit' ? [0.75, 0.08, 0.06] : e.k === 'block' ? [1, 0.85, 0.3] : e.k === 'guardbreak' ? [1, 1, 1] : [0.6, 0.6, 0.6];
        if (e.k === 'hit' || e.k === 'block' || e.k === 'guardbreak') for (let i = 0; i < (e.k === 'hit' ? 9 : 7); i++) sparks.push({ x: e.x, y, z: e.z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.35 + Math.random() * 0.3, col });
        if (e.b === player.id && e.k === 'hit') haptic('medium');
        if (e.b === player.id && e.k === 'block') say('🛡 To‘sildi!');
        if (e.b === player.id && e.k === 'guardbreak') say('Himoya sindi! Chidamlilik tugadi');
        if (e.a === player.id && e.k === 'block') say('Dushman to‘sdi');
        if (e.a === player.id && e.k === 'kill') haptic('success');
      }
      if (S.dayCycle) dayT = (dayT + dt / 360) % 1;
      if (!over) {
        if (player.state === 'dead') finish(false);
        else if (ar.alive(1).length === 0) {
          waveTimer += dt;
          if (waveTimer > 3) {
            waveTimer = 0; wave++;
            if (wave >= WAVES.length) finish(true);
            else {
              for (const f of ar.fighters) if (f.team === 0 && f.state !== 'dead') f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.35);
              addAlly(ar.fighters.length); addAlly(ar.fighters.length + 1);
              spawnWave();
            }
          }
        }
      }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
    }
    render(dt); hud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function alertBox(msg: string) {
  const b = h('div', { class: 'g3-panel' }, h('h2', {}, '⚠ 3D ishga tushmadi'), h('p', {}, msg), h('button', { class: 'btn wide', onClick: () => b.remove() }, 'OK'));
  document.body.append(b);
}
