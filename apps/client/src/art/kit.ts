// apps/client/src/art/kit.ts
// Protsedural 2D "hand-painted" chizish to'plami (Canvas 2D). Phaser bu canvaslarni tekstura sifatida ishlatadi.
// Izometrik proyeksiya: x o'ngga-pastga, z chapga-pastga, y yuqoriga. ISO = 0.5 (2:1).

export type Ctx = CanvasRenderingContext2D;

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Izometrik quti: (cx, baseY) - old pastki burchak; w - kenglik, d - chuqurlik, hgt - balandlik */
export function isoBox(c: Ctx, cx: number, baseY: number, w: number, d: number, hgt: number, color: string) {
  const hw = w / 2, hd = d / 2;
  // chap yuz
  c.fillStyle = shade(color, 0.78);
  c.beginPath(); c.moveTo(cx - hw, baseY - hd / 2 - hgt); c.lineTo(cx, baseY - hgt); c.lineTo(cx, baseY); c.lineTo(cx - hw, baseY - hd / 2); c.closePath(); c.fill();
  // o'ng yuz
  c.fillStyle = shade(color, 0.62);
  c.beginPath(); c.moveTo(cx, baseY - hgt); c.lineTo(cx + hw, baseY - hd / 2 - hgt); c.lineTo(cx + hw, baseY - hd / 2); c.lineTo(cx, baseY); c.closePath(); c.fill();
  // tom
  c.fillStyle = shade(color, 1.05);
  c.beginPath(); c.moveTo(cx, baseY - hgt); c.lineTo(cx - hw, baseY - hd / 2 - hgt); c.lineTo(cx, baseY - hd - hgt); c.lineTo(cx + hw, baseY - hd / 2 - hgt); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(40,25,10,0.35)'; c.lineWidth = 1; c.stroke();
}

export function ground(c: Ctx, cx: number, cy: number, w: number, color: string) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(cx, cy - w / 4); c.lineTo(cx + w / 2, cy); c.lineTo(cx, cy + w / 4); c.lineTo(cx - w / 2, cy); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.15)'; c.stroke();
}

/** Qovurg'ali gumbaz (Temuriy, Go'ri Amir uslubi) */
export function ribbedDome(c: Ctx, cx: number, y: number, r: number, color: string, ribs = 9, gold = '#d4a537') {
  // baraban
  c.fillStyle = shade(color, 0.7); c.fillRect(cx - r * 0.8, y - r * 0.35, r * 1.6, r * 0.45);
  c.fillStyle = gold; c.fillRect(cx - r * 0.8, y - r * 0.35, r * 1.6, r * 0.08);
  const top = y - r * 0.35;
  const g = c.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(color, 1.25)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, 0.55));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(cx - r, top);
  c.bezierCurveTo(cx - r * 1.05, top - r * 1.2, cx - r * 0.25, top - r * 1.55, cx, top - r * 1.75);
  c.bezierCurveTo(cx + r * 0.25, top - r * 1.55, cx + r * 1.05, top - r * 1.2, cx + r, top);
  c.closePath(); c.fill();
  c.strokeStyle = shade(color, 0.5); c.lineWidth = 1;
  for (let i = 1; i < ribs; i++) {
    const t = i / ribs, x = cx - r + 2 * r * t;
    c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + (cx - x) * 0.35, top - r * 1.2, cx, top - r * 1.72); c.stroke();
  }
  c.fillStyle = gold; c.fillRect(cx - 1, top - r * 1.75 - r * 0.35, 2, r * 0.35);
}

/** Silliq gumbaz (Usmonli: qo'rg'oshin rang) */
export function dome(c: Ctx, cx: number, y: number, r: number, color: string, finial = '#d4a537') {
  const g = c.createRadialGradient(cx - r * 0.4, y - r * 0.7, r * 0.1, cx, y - r * 0.3, r * 1.1);
  g.addColorStop(0, shade(color, 1.35)); g.addColorStop(1, shade(color, 0.6));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(cx, y, r, r * 0.95, 0, Math.PI, 0); c.closePath(); c.fill();
  c.fillStyle = finial; c.fillRect(cx - 1, y - r - r * 0.45, 2, r * 0.45);
  c.beginPath(); c.arc(cx, y - r - r * 0.5, r * 0.12, 0, Math.PI * 2); c.fill();
}

/** Piyozsimon gumbaz (Rus) */
export function onionDome(c: Ctx, cx: number, y: number, r: number, color: string) {
  const g = c.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(color, 1.3)); g.addColorStop(1, shade(color, 0.6));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(cx - r * 0.55, y);
  c.bezierCurveTo(cx - r * 1.25, y - r * 0.7, cx - r * 0.2, y - r * 1.3, cx, y - r * 2);
  c.bezierCurveTo(cx + r * 0.2, y - r * 1.3, cx + r * 1.25, y - r * 0.7, cx + r * 0.55, y);
  c.closePath(); c.fill();
  c.strokeStyle = '#d4a537'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx, y - r * 2); c.lineTo(cx, y - r * 2.6); c.moveTo(cx - r * 0.3, y - r * 2.4); c.lineTo(cx + r * 0.3, y - r * 2.4); c.stroke();
}

/** Peshtoq: koshinli portal, ichida ravoq (Temuriy) */
export function pishtaq(c: Ctx, cx: number, baseY: number, w: number, hgt: number, wall: string, tile: string, gold: string) {
  c.fillStyle = wall; c.fillRect(cx - w / 2, baseY - hgt, w, hgt);
  // koshin ramka
  c.fillStyle = tile; c.fillRect(cx - w / 2, baseY - hgt, w, hgt * 0.12);
  c.fillRect(cx - w / 2, baseY - hgt, w * 0.1, hgt); c.fillRect(cx + w / 2 - w * 0.1, baseY - hgt, w * 0.1, hgt);
  // girih nuqtalari
  c.fillStyle = gold;
  for (let i = 0; i < 6; i++) c.fillRect(cx - w / 2 + w * 0.02, baseY - hgt + hgt * 0.18 + i * hgt * 0.13, w * 0.06, hgt * 0.04);
  for (let i = 0; i < 6; i++) c.fillRect(cx + w / 2 - w * 0.08, baseY - hgt + hgt * 0.18 + i * hgt * 0.13, w * 0.06, hgt * 0.04);
  // ravoq
  const aw = w * 0.52, ah = hgt * 0.72;
  c.fillStyle = shade(tile, 0.45);
  c.beginPath(); c.moveTo(cx - aw / 2, baseY); c.lineTo(cx - aw / 2, baseY - ah * 0.6);
  c.quadraticCurveTo(cx - aw / 2, baseY - ah, cx, baseY - ah); c.quadraticCurveTo(cx + aw / 2, baseY - ah, cx + aw / 2, baseY - ah * 0.6);
  c.lineTo(cx + aw / 2, baseY); c.closePath(); c.fill();
  // muqarnas izi
  c.strokeStyle = gold; c.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, baseY - ah * 0.6, aw * 0.12 * i, Math.PI, 0); c.stroke(); }
}

export function minaret(c: Ctx, x: number, baseY: number, hgt: number, w: number, color: string, cap: 'cone' | 'pencil' | 'flat', accent: string) {
  c.fillStyle = shade(color, 0.9); c.fillRect(x - w / 2, baseY - hgt, w, hgt);
  c.fillStyle = shade(color, 0.7); c.fillRect(x + w * 0.1, baseY - hgt, w * 0.4, hgt);
  c.fillStyle = accent;
  for (let i = 1; i <= 3; i++) c.fillRect(x - w / 2, baseY - hgt * (i / 4), w, 2);
  c.fillRect(x - w * 0.75, baseY - hgt * 0.82, w * 1.5, 3);
  if (cap === 'pencil') { c.fillStyle = '#7d8b94'; c.beginPath(); c.moveTo(x - w / 2, baseY - hgt); c.lineTo(x, baseY - hgt - w * 3); c.lineTo(x + w / 2, baseY - hgt); c.fill(); }
  else if (cap === 'cone') { c.fillStyle = accent; c.beginPath(); c.moveTo(x - w * 0.6, baseY - hgt); c.lineTo(x, baseY - hgt - w * 1.4); c.lineTo(x + w * 0.6, baseY - hgt); c.fill(); }
}

export function crenels(c: Ctx, x0: number, y: number, w: number, color: string, n = 6) {
  c.fillStyle = color;
  const step = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) c.fillRect(x0 + i * step * 2, y - step, step, step);
}

export function gableRoof(c: Ctx, cx: number, y: number, w: number, hgt: number, color: string) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(cx - w / 2, y); c.lineTo(cx, y - hgt); c.lineTo(cx + w / 2, y); c.closePath(); c.fill();
  c.fillStyle = shade(color, 0.7);
  c.beginPath(); c.moveTo(cx, y - hgt); c.lineTo(cx + w / 2, y); c.lineTo(cx + w * 0.62, y - hgt * 0.1); c.lineTo(cx + w * 0.12, y - hgt * 1.1); c.closePath(); c.fill();
}

/** Pagoda tomi: chetlari yuqoriga qayrilgan */
export function pagodaRoof(c: Ctx, cx: number, y: number, w: number, hgt: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(cx - w / 2, y - hgt * 0.32);                       // chap qayrilgan uch
  c.quadraticCurveTo(cx - w * 0.42, y, cx - w * 0.3, y);       // pastki egri
  c.lineTo(cx + w * 0.3, y);
  c.quadraticCurveTo(cx + w * 0.42, y, cx + w / 2, y - hgt * 0.32);
  c.lineTo(cx + w * 0.22, y - hgt * 0.62);
  c.lineTo(cx + w * 0.08, y - hgt);
  c.lineTo(cx - w * 0.08, y - hgt);
  c.lineTo(cx - w * 0.22, y - hgt * 0.62);
  c.closePath(); c.fill();
  c.fillStyle = shade(color, 0.72);
  c.beginPath(); c.moveTo(cx, y); c.lineTo(cx + w * 0.3, y); c.quadraticCurveTo(cx + w * 0.42, y, cx + w / 2, y - hgt * 0.32);
  c.lineTo(cx + w * 0.22, y - hgt * 0.62); c.lineTo(cx + w * 0.08, y - hgt); c.lineTo(cx, y - hgt); c.closePath(); c.fill();
  c.strokeStyle = shade(color, 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(cx - w * 0.3, y); c.lineTo(cx + w * 0.3, y); c.stroke();
}

export function yurt(c: Ctx, cx: number, baseY: number, r: number, felt: string, band: string) {
  c.fillStyle = shade(felt, 0.92); c.fillRect(cx - r, baseY - r * 0.7, r * 2, r * 0.7);
  c.fillStyle = shade(felt, 0.75); c.fillRect(cx + r * 0.2, baseY - r * 0.7, r * 0.8, r * 0.7);
  c.fillStyle = felt;
  c.beginPath(); c.moveTo(cx - r * 1.05, baseY - r * 0.68); c.quadraticCurveTo(cx, baseY - r * 1.55, cx + r * 1.05, baseY - r * 0.68); c.closePath(); c.fill();
  c.fillStyle = band; c.fillRect(cx - r, baseY - r * 0.45, r * 2, r * 0.1);
  c.fillStyle = '#c0392b'; c.fillRect(cx - r * 0.18, baseY - r * 0.5, r * 0.36, r * 0.5);
}

export function flag(c: Ctx, x: number, y: number, color: string, len = 14) {
  c.strokeStyle = '#3b2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - len * 1.6); c.stroke();
  c.fillStyle = color; c.beginPath(); c.moveTo(x, y - len * 1.6); c.lineTo(x + len, y - len * 1.35); c.lineTo(x, y - len * 1.05); c.fill();
}

export function tree(c: Ctx, x: number, y: number, s: number, kind: 'pine' | 'leaf' | 'cypress') {
  c.fillStyle = '#5b3a1e'; c.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.3);
  if (kind === 'pine') { c.fillStyle = '#2f5d34'; c.beginPath(); c.moveTo(x - s * 0.35, y - s * 0.25); c.lineTo(x, y - s * 1.1); c.lineTo(x + s * 0.35, y - s * 0.25); c.fill(); }
  else if (kind === 'cypress') { c.fillStyle = '#2d5a3c'; c.beginPath(); c.ellipse(x, y - s * 0.7, s * 0.14, s * 0.5, 0, 0, Math.PI * 2); c.fill(); }
  else { c.fillStyle = '#4f7f3a'; c.beginPath(); c.arc(x, y - s * 0.55, s * 0.32, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6a9b4a'; c.beginPath(); c.arc(x - s * 0.1, y - s * 0.62, s * 0.16, 0, Math.PI * 2); c.fill(); }
}
