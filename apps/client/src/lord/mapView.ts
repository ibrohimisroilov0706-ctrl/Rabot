// apps/client/src/lord/mapView.ts
// Global xarita (Canvas 2D): terren, shahar/qal'a/qishloqlar, harakatlanuvchi otryadlar, kecha-kunduz.
// Boshqaruv: bosish - borish, bir barmoq bilan surish - kamera, ikki barmoq - masshtab.

import type { Culture } from '@qirolliklar/game-rules';
import { drawBuilding } from '../art/buildings.js';
import { MAP_SIZE, terrainAt, valueNoise, type Terrain } from '@qirolliklar/game-rules';
import { shade, tree } from '../art/kit.js';
import { unitFrame, FRAMES } from '../art/soldiers.js';
import { FACTIONS, groupOf, troop } from './data.js';
import { count, d2, facOfParty, hostile, playerFac, atWar, type Party, type Sett, type World } from './world.js';

type Tap = { kind: 'set'; id: string } | { kind: 'party'; id: string } | { kind: 'pt'; x: number; y: number };

const icons = new Map<string, HTMLCanvasElement>();
function settIcon(kind: Sett['kind'], cu: Culture): HTMLCanvasElement {
  const k = `${kind}|${cu}`; let cv = icons.get(k); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = 160; cv.height = 160; const c = cv.getContext('2d')!;
  const b = (key: Parameters<typeof drawBuilding>[2], lvl: number) => drawBuilding(document.createElement('canvas'), cu, key, lvl);
  if (kind === 'town') { c.drawImage(b('saroy', 7), 10, -18, 140, 140); c.drawImage(b('devor', 8), 0, 22, 160, 140); c.drawImage(b('mahalla', 4), -30, 40, 90, 90); c.drawImage(b('bozor', 4), 100, 44, 80, 80); }
  else if (kind === 'castle') { c.drawImage(b('minora', 6), 30, -14, 100, 120); c.drawImage(b('devor', 6), 5, 26, 150, 130); }
  else { c.drawImage(b('ferma', 2), -6, 16, 110, 110); c.drawImage(b('mahalla', 2), 40, 28, 120, 120); }
  icons.set(k, cv); return cv;
}

const TP = 8; // asosiy teksturada katak = 8px (yumshoq o'tishlar uchun)
const BASE: Record<Terrain, string> = { tekislik: '#93b15f', ormon: '#5f8b47', tog: '#a09787', chol: '#ddc58c', daryo: '#4f8cc0' };
function drawBase(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = MAP_SIZE * TP; cv.height = MAP_SIZE * TP;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    const t = terrainAt(x, y);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const v = 0.9 + valueNoise((x + i / 2) / 2.5, (y + j / 2) / 2.5, 11) * 0.18;
      c.fillStyle = shade(BASE[t], v); c.fillRect(x * TP + i * TP / 2, y * TP + j * TP / 2, TP / 2, TP / 2);
    }
  }
  // chegaralarni yumshatish + mayda don
  const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
  const o = out.getContext('2d')!;
  o.filter = 'blur(3px)'; o.drawImage(cv, 0, 0); o.filter = 'none';
  let seed = 1;
  for (let i = 0; i < 26000; i++) { seed = (seed * 16807) % 2147483647; const x = seed % out.width; seed = (seed * 16807) % 2147483647; const y = seed % out.height; o.fillStyle = i % 2 ? 'rgba(255,255,240,0.07)' : 'rgba(30,40,10,0.08)'; o.fillRect(x, y, 2, 2); }
  return out;
}
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(kind: string): HTMLCanvasElement {
  let cv = sprites.get(kind); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = 96; cv.height = 96; const c = cv.getContext('2d')!;
  if (kind === 'pine' || kind === 'leaf' || kind === 'cypress') {
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(48, 88, 22, 6, 0, 0, Math.PI * 2); c.fill();
    tree(c, 48, 88, 70, kind);
    if (kind === 'pine') { c.fillStyle = '#3c7444'; c.beginPath(); c.moveTo(48 - 18, 88 - 34); c.lineTo(48, 88 - 74); c.lineTo(48 + 18, 88 - 34); c.fill(); }
  } else if (kind === 'mount') {
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(48, 90, 44, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7c746a'; c.beginPath(); c.moveTo(4, 90); c.lineTo(46, 12); c.lineTo(92, 90); c.fill();
    c.fillStyle = '#5f584f'; c.beginPath(); c.moveTo(46, 12); c.lineTo(92, 90); c.lineTo(56, 90); c.fill();
    c.fillStyle = '#f3f1ec'; c.beginPath(); c.moveTo(34, 34); c.lineTo(46, 12); c.lineTo(60, 36); c.lineTo(52, 32); c.lineTo(46, 38); c.lineTo(40, 31); c.fill();
  } else if (kind === 'dune') {
    c.strokeStyle = 'rgba(150,110,50,0.55)'; c.lineWidth = 4; c.beginPath(); c.arc(48, 92, 40, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.strokeStyle = 'rgba(255,240,200,0.5)'; c.lineWidth = 3; c.beginPath(); c.arc(48, 96, 40, Math.PI * 1.2, Math.PI * 1.6); c.stroke();
  } else if (kind === 'grass') {
    c.strokeStyle = '#5d8a3a'; c.lineWidth = 4; for (const dx of [-8, 0, 8]) { c.beginPath(); c.moveTo(48 + dx, 88); c.lineTo(48 + dx * 1.6, 66); c.stroke(); }
  } else if (kind === 'bush') {
    c.fillStyle = '#5a8a3e'; c.beginPath(); c.arc(40, 80, 12, 0, Math.PI * 2); c.arc(54, 78, 14, 0, Math.PI * 2); c.fill();
  } else if (kind === 'wave') {
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 50); c.quadraticCurveTo(36, 40, 52, 50); c.quadraticCurveTo(68, 60, 80, 50); c.stroke();
  }
  sprites.set(kind, cv); return cv;
}
/** Har bir katak uchun bezaklar (deterministik) */
function details(x: number, y: number): [string, number, number, number][] {
  const t = terrainAt(x, y); const n = valueNoise(x * 1.7, y * 1.7, 5), m = valueNoise(x * 2.3, y * 2.9, 9);
  const north = y < 40;
  if (t === 'ormon') return [[north ? 'pine' : m > 0.5 ? 'leaf' : 'cypress', 0.3 + n * 0.2, 0.55, 0.9], [north || m > 0.6 ? 'pine' : 'leaf', 0.75 - m * 0.2, 0.95, 0.8], ...(n > 0.45 ? [[north ? 'pine' : 'leaf', 0.55, 0.35, 0.7] as [string, number, number, number]] : [])];
  if (t === 'tog') return [['mount', 0.5, 0.95, 1.5 + n * 0.5]];
  if (t === 'chol' && n > 0.55) return [['dune', 0.5, 0.8, 1.1]];
  if (t === 'daryo' && n > 0.4) return [['wave', 0.5, 0.5, 0.8]];
  if (t === 'tekislik') { if (n > 0.86) return [['bush', 0.4, 0.8, 0.7]]; if (m > 0.8) return [['grass', 0.6, 0.7, 0.5]]; }
  return [];
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private blocked: Set<string> | null = null;
  camX = 64; camY = 64; z = 30; follow = true;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinch0 = 0; private z0 = 30; private moved = false;
  onTap: (t: Tap) => void = () => {};
  private w!: World;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'lord-map';
    host.append(this.canvas);
    this.c = this.canvas.getContext('2d')!;
    this.terrain = drawBase();
    this.resize(); window.addEventListener('resize', () => this.resize());
    const el = this.canvas;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); this.moved = false; if (this.pointers.size === 2) { this.pinch0 = this.pinchDist(); this.z0 = this.z; } });
    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (this.pointers.size === 2) { p.x = e.clientX; p.y = e.clientY; const d = this.pinchDist(); if (this.pinch0 > 0) this.z = Math.max(12, Math.min(60, this.z0 * d / this.pinch0)); this.moved = true; return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > 10) { this.moved = true; this.follow = false; }
      if (this.moved) { this.camX -= dx / this.z; this.camY -= dy / this.z; this.clampCam(); }
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
      if (p && !this.moved && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => this.pointers.delete(e.pointerId));
    el.addEventListener('wheel', e => { e.preventDefault(); this.z = Math.max(12, Math.min(60, this.z * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
  }
  private pinchDist() { const [a, b] = [...this.pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
  resize() {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`; this.canvas.style.height = `${r.height}px`;
  }
  private get W() { return this.canvas.width / this.dpr; }
  private get H() { return this.canvas.height / this.dpr; }
  private clampCam() { this.camX = Math.max(0, Math.min(128, this.camX)); this.camY = Math.max(0, Math.min(128, this.camY)); }
  private toScreen(x: number, y: number) { return { x: (x - this.camX) * this.z + this.W / 2, y: (y - this.camY) * this.z + this.H / 2 }; }
  private toWorld(sx: number, sy: number) { return { x: (sx - this.W / 2) / this.z + this.camX, y: (sy - this.H / 2) / this.z + this.camY }; }
  centerOn(x: number, y: number) { this.camX = x; this.camY = y; this.clampCam(); }

  private tap(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    const p = this.toWorld(cx - r.left, cy - r.top); const w = this.w;
    let best: Tap | null = null, bd = 1e9;
    for (const q of w.parties) { if (q.kind === 'player' || q.down) continue; const d = d2(q, { x: p.x, y: p.y + 0.4 }); if (d < 0.9 && d < bd) { bd = d; best = { kind: 'party', id: q.id }; } }
    if (!best) for (const s of w.sets) { const rad = s.kind === 'town' ? 1.6 : s.kind === 'castle' ? 1.3 : 1.0; const d = d2(s, { x: p.x, y: p.y + 0.3 }); if (d < rad && d < bd) { bd = d; best = { kind: 'set', id: s.id }; } }
    this.follow = true;
    this.onTap(best ?? { kind: 'pt', x: Math.max(1, Math.min(127, p.x)), y: Math.max(1, Math.min(127, p.y)) });
  }

  render(w: World, now: number) {
    this.w = w;
    const c = this.c; const W = this.W, H = this.H, z = this.z;
    const pl = w.parties.find(p => p.kind === 'player')!;
    if (this.follow) { this.camX += (pl.x - this.camX) * 0.15; this.camY += (pl.y - this.camY) * 0.15; }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#2b4a6b'; c.fillRect(0, 0, W, H);
    // terren
    const x0 = this.camX - W / 2 / z, y0 = this.camY - H / 2 / z;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.terrain, x0 * TP, y0 * TP, (W / z) * TP, (H / z) * TP, 0, 0, W, H);
    if (z >= 15) {
      if (!this.blocked) { this.blocked = new Set(); for (const s of w.sets) for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) this.blocked.add(`${Math.floor(s.x) + dx},${Math.floor(s.y) + dy}`); }
      const tx0 = Math.max(0, Math.floor(x0) - 1), ty0 = Math.max(0, Math.floor(y0) - 1), tx1 = Math.min(MAP_SIZE - 1, Math.ceil(x0 + W / z) + 1), ty1 = Math.min(MAP_SIZE - 1, Math.ceil(y0 + H / z) + 2);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (this.blocked.has(`${tx},${ty}`)) continue;
        for (const [k, ox, oy, sz] of details(tx, ty)) {
          const p = this.toScreen(tx + ox, ty + oy); const S = z * sz;
          c.drawImage(sprite(k), p.x - S / 2, p.y - S * 0.92, S, S);
        }
      }
    }
    // yo'l chizig'i
    if (pl.goal) {
      const g = pl.goal.kind === 'pt' ? pl.goal : pl.goal.kind === 'set' ? w.sets.find(s => s.id === (pl.goal as { id: string }).id) : w.parties.find(p => p.id === (pl.goal as { id: string }).id);
      if (g) { const a = this.toScreen(pl.x, pl.y), b = this.toScreen(g.x, g.y); c.setLineDash([6, 6]); c.lineDashOffset = -now / 40; c.strokeStyle = 'rgba(255,240,190,0.85)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]); c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(b.x, b.y, 5, 0, Math.PI * 2); c.fill(); }
    }
    const pf = playerFac(w);
    // aholi punktlari
    const vis = (x: number, y: number, m: number) => x > x0 - m && x < x0 + W / z + m && y > y0 - m && y < y0 + H / z + m;
    const sets = w.sets.filter(s => vis(s.x, s.y, 3)).sort((a, b) => a.y - b.y);
    for (const s of sets) {
      const size = (s.kind === 'town' ? 3.6 : s.kind === 'castle' ? 2.9 : 2.2) * z;
      const p = this.toScreen(s.x, s.y);
      c.drawImage(settIcon(s.kind, s.cu), p.x - size / 2, p.y - size * 0.72, size, size);
      if (s.looted > w.t && s.kind === 'village') this.smoke(p.x, p.y - size * 0.3, now);
      if (s.siegeBy) { c.font = `${Math.round(z * 0.8)}px system-ui`; c.textAlign = 'center'; c.fillText('⚔', p.x + size * 0.35, p.y - size * 0.45); }
      this.label(p.x, p.y + size * 0.24, s.name, FACTIONS[s.fac].color, s.owner === 'player', atWar(w, pf, s.fac), s.kind === 'village' ? 11 : 13);
    }
    // otryadlar
    const parties = w.parties.filter(p => !p.down && vis(p.x, p.y, 2)).sort((a, b) => a.y - b.y);
    for (const p of parties) this.drawParty(p, now, p.kind === 'player' ? false : hostile(w, p, pl), p.kind === 'player');
    // kecha
    const hour = w.t % 24;
    const night = hour < 5 || hour > 20 ? 0.42 : hour < 7 ? 0.42 * (7 - hour) / 2 : hour > 18 ? 0.42 * (hour - 18) / 2 : 0;
    if (night > 0) { c.fillStyle = `rgba(10,20,60,${night.toFixed(3)})`; c.fillRect(0, 0, W, H); }
  }

  private smoke(x: number, y: number, now: number) {
    const c = this.c;
    for (let i = 0; i < 3; i++) { const t = ((now / 1400) + i / 3) % 1; c.fillStyle = `rgba(60,60,60,${0.5 * (1 - t)})`; c.beginPath(); c.arc(x + Math.sin(t * 6 + i) * 4, y - t * 26, 4 + t * 8, 0, Math.PI * 2); c.fill(); }
  }

  private label(x: number, y: number, text: string, color: string, mine: boolean, enemy: boolean, size: number) {
    const c = this.c;
    c.font = `600 ${size}px system-ui`; c.textAlign = 'center';
    const tw = c.measureText(text).width + 18;
    c.fillStyle = 'rgba(15,20,30,0.72)'; c.beginPath(); if (c.roundRect) c.roundRect(x - tw / 2, y - size + 1, tw, size + 6, 6); else c.rect(x - tw / 2, y - size + 1, tw, size + 6); c.fill();
    if (mine) { c.strokeStyle = '#f0c040'; c.lineWidth = 1.5; c.stroke(); }
    else if (enemy) { c.strokeStyle = 'rgba(230,70,60,0.9)'; c.lineWidth = 1.2; c.stroke(); }
    c.fillStyle = color; c.beginPath(); c.arc(x - tw / 2 + 8, y - size / 2 + 3, 3.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.fillText(text, x + 4, y + 2);
  }

  private drawParty(p: Party, now: number, enemy: boolean, me: boolean) {
    const c = this.c; const z = this.z; const pos = this.toScreen(p.x, p.y);
    const lead = p.troops.slice().sort((a, b) => (groupOf(troop(b.id).cls) === 'cav' ? 1 : 0) - (groupOf(troop(a.id).cls) === 'cav' ? 1 : 0) || troop(b.id).tier - troop(a.id).tier)[0];
    const art = me ? `${p.cu}_cav4` : lead?.id;
    const moving = !!p.goal;
    const fr = moving ? Math.floor(now / 110) % FRAMES : 0;
    const dir = p.goal ? ((p.goal.kind === 'pt' ? p.goal.x : this.w.sets.find(s => s.id === (p.goal as { id: string }).id)?.x ?? this.w.parties.find(q => q.id === (p.goal as { id: string }).id)?.x ?? p.x) < p.x ? -1 : 1) : 1;
    const hgt = z * 1.9, wid = hgt * (72 / 76);
    // halqa
    c.fillStyle = me ? 'rgba(240,192,64,0.35)' : enemy ? 'rgba(220,60,50,0.3)' : 'rgba(255,255,255,0.18)';
    c.beginPath(); c.ellipse(pos.x, pos.y, z * 0.75, z * 0.3, 0, 0, Math.PI * 2); c.fill();
    if (art) {
      const t = troop(art);
      const img = unitFrame(t.cu, t.art, moving ? 'walk' : 'idle', fr, 0);
      c.save(); c.translate(pos.x, pos.y + hgt * 0.08); c.scale(dir, 1); c.drawImage(img, -wid / 2 + 4 * hgt / 76, -hgt, wid, hgt); c.restore();
    }
    // bayroq
    const fx = pos.x - z * 0.55, fy = pos.y - hgt * 0.95;
    c.strokeStyle = '#3b2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, pos.y); c.lineTo(fx, fy); c.stroke();
    const wave = Math.sin(now / 200 + p.x) * 2;
    c.fillStyle = FACTIONS[me ? (this.w.player.liege ?? 'player') : facOfParty(this.w, p)].color;
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + z * 0.6, fy + 3 + wave); c.lineTo(fx, fy + z * 0.35); c.fill();
    if (me) { c.fillStyle = '#f0c040'; c.font = `${Math.round(z * 0.4)}px system-ui`; c.textAlign = 'center'; c.fillText('👑', fx + z * 0.2, fy - 2); }
    this.label(pos.x, pos.y + z * 0.75, `${p.name} · ${count(p.troops)}`, FACTIONS[facOfParty(this.w, p)].color, me, enemy, 11);
  }
}
