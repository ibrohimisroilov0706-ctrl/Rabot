// apps/client/src/art/palaceScene.ts
// Saroy manzarasi: osmon (kun/kechqurun/tun - telefon soatiga qarab), qal'a devorlari, millat uslubidagi katta saroy,
// bayroqlar, darvoza oldida qo'riqchilar. Saroy darajasi oshgan sari devor, minora va qo'riqchilar ko'payadi.

import type { Culture } from '@qirolliklar/game-rules';
import { PALETTE, drawBuilding } from './buildings.js';
import { LOOK, shade, unitFrame, FRAME_H, FRAME_W } from './soldiers.js';

const GUARD: Record<Culture, string> = { rus: 'drujina', ingliz: 'ritsar', usmonli: 'yangicheri', temuriy: 'nayzachi', mogul: 'nayzachi' };

export function drawPalaceScene(canvas: HTMLCanvasElement, cu: Culture, level: number, title: string, hour = new Date().getHours()) {
  const W = canvas.width, H = canvas.height;
  const c = canvas.getContext('2d')!;
  const P = PALETTE[cu], L = LOOK[cu];
  const night = hour < 6 || hour >= 20, dusk = !night && (hour >= 17 || hour < 8);
  // osmon
  const g = c.createLinearGradient(0, 0, 0, H * 0.7);
  if (night) { g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#1e3560'); }
  else if (dusk) { g.addColorStop(0, '#3b4f8c'); g.addColorStop(0.6, '#e9925a'); g.addColorStop(1, '#f6c98a'); }
  else { g.addColorStop(0, '#5d9bd8'); g.addColorStop(1, '#cfe6f7'); }
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (night) { c.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = (i * 53) % (H * 0.45); c.globalAlpha = 0.3 + (i % 5) / 7; c.fillRect(x, y, 1.5, 1.5); } c.globalAlpha = 1; c.fillStyle = '#f4f1de'; c.beginPath(); c.arc(W * 0.82, H * 0.16, H * 0.06, 0, Math.PI * 2); c.fill(); }
  else { c.fillStyle = dusk ? 'rgba(255,200,120,.95)' : 'rgba(255,250,225,.95)'; c.beginPath(); c.arc(W * 0.82, dusk ? H * 0.42 : H * 0.15, H * 0.07, 0, Math.PI * 2); c.fill(); }
  // uzoq tepaliklar
  c.fillStyle = night ? '#1b2b44' : dusk ? '#8a6a6a' : '#86a6a8';
  c.beginPath(); c.moveTo(0, H * 0.62); for (let x = 0; x <= W; x += 30) c.lineTo(x, H * 0.55 - Math.abs(Math.sin(x * 0.013)) * H * 0.1); c.lineTo(W, H * 0.62); c.fill();
  // yer
  const gc = P.ground;
  c.fillStyle = night ? shade(gc, 0.45) : shade(gc, 0.9); c.fillRect(0, H * 0.62, W, H);
  // devor
  const wallTop = H * 0.6, wallBot = H * 0.8;
  const stone = cu === 'rus' && level < 5 ? '#7a4f26' : cu === 'temuriy' ? '#cdb184' : cu === 'mogul' && level < 5 ? '#7a4f26' : P.wall;
  const dark = night ? 0.55 : 1;
  c.fillStyle = shade(stone, 0.85 * dark); c.fillRect(0, wallTop, W, wallBot - wallTop);
  for (let x = 0; x < W; x += 16) c.fillRect(x, wallTop - 9, 9, 9);
  const towers = Math.min(6, 2 + Math.floor(level / 3));
  for (let i = 0; i < towers; i++) {
    const tx = (W / (towers - 1 || 1)) * i - 16;
    c.fillStyle = shade(stone, 0.95 * dark); c.fillRect(tx, wallTop - 34, 32, wallBot - wallTop + 34);
    for (let j = 0; j < 3; j++) c.fillRect(tx + j * 12, wallTop - 42, 8, 8);
    if (cu === 'temuriy') { c.fillStyle = shade(P.tile, dark); c.fillRect(tx, wallTop - 30, 32, 4); }
    c.strokeStyle = '#3b2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(tx + 16, wallTop - 42); c.lineTo(tx + 16, wallTop - 72); c.stroke();
    c.fillStyle = P.flag; c.beginPath(); c.moveTo(tx + 16, wallTop - 72); c.lineTo(tx + 38, wallTop - 66); c.lineTo(tx + 16, wallTop - 60); c.fill();
  }
  // saroy (markazda, katta)
  const pal = drawBuilding(document.createElement('canvas'), cu, 'saroy', Math.max(1, level));
  const ps = Math.min(W * 0.78, H * 1.12);
  c.save(); if (night) c.filter = 'brightness(0.6)';
  c.drawImage(pal, W / 2 - ps / 2, wallTop + H * 0.14 - ps * 0.8, ps, ps);
  c.restore();
  if (night) { c.fillStyle = 'rgba(255,200,90,.85)'; for (let i = 0; i < 6; i++) c.fillRect(W / 2 - ps * 0.2 + i * ps * 0.08, wallTop - ps * 0.12 + (i % 2) * 8, 3, 5); }
  // darvoza
  c.fillStyle = '#2b1d10'; c.beginPath(); c.moveTo(W / 2 - 22, wallBot); c.lineTo(W / 2 - 22, wallBot - 30); c.quadraticCurveTo(W / 2, wallBot - 48, W / 2 + 22, wallBot - 30); c.lineTo(W / 2 + 22, wallBot); c.fill();
  c.strokeStyle = L.trim; c.lineWidth = 2; c.stroke();
  // qo'riqchilar
  const guards = Math.min(8, 2 + Math.floor(level / 2));
  for (let i = 0; i < guards; i++) {
    const side = i % 2 ? 1 : -1, n = Math.floor(i / 2);
    const x = W / 2 + side * (36 + n * 26), y = wallBot + 18 + n * 4;
    const img = unitFrame(cu, GUARD[cu], 'idle', 0, i % 3);
    const s = H / 300;
    c.save(); c.translate(x, y); if (side > 0) c.scale(-1, 1);
    c.drawImage(img, -FRAME_W * s / 2, -FRAME_H * s + 6 * s, FRAME_W * s, FRAME_H * s); c.restore();
  }
  // sarlavha
  const grd = c.createLinearGradient(0, H * 0.84, 0, H); grd.addColorStop(0, 'rgba(11,31,56,0)'); grd.addColorStop(1, 'rgba(11,31,56,.85)');
  c.fillStyle = grd; c.fillRect(0, H * 0.84, W, H * 0.16);
  c.font = `700 ${Math.round(H * 0.075)}px Georgia, serif`; c.textAlign = 'center'; c.fillStyle = '#f0d58a';
  c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.strokeText(title, W / 2, H * 0.95); c.fillText(title, W / 2, H * 0.95);
  return canvas;
}
