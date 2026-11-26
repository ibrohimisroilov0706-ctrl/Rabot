// apps/client/src/art/terrain.ts
// Dunyo xaritasi teksturasi: game-rules dagi terrainAt() dan chiziladi, shuning uchun server bilan bir xil.

import { MAP_SIZE, terrainAt, valueNoise, type Terrain } from '@qirolliklar/game-rules';
import { shade, tree } from './kit.js';

export const TILE = 16;
const BASE: Record<Terrain, string> = { tekislik: '#9db36b', ormon: '#4f7a43', tog: '#8a8378', chol: '#dcc48b', daryo: '#3f7fb5' };

export function drawWorld(canvas: HTMLCanvasElement) {
  const S = MAP_SIZE * TILE;
  canvas.width = S; canvas.height = S;
  const c = canvas.getContext('2d')!;
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    const t = terrainAt(x, y);
    const v = 0.9 + valueNoise(x / 3, y / 3, 11) * 0.2;
    c.fillStyle = shade(BASE[t], v);
    c.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  // detallar (alohida o'tishda, qo'shni kataklarga chiqib turishi uchun)
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    const t = terrainAt(x, y); const px = x * TILE, py = y * TILE; const n = valueNoise(x * 1.7, y * 1.7, 5);
    if (t === 'ormon') { tree(c, px + 5, py + 13, 12, y < 40 ? 'pine' : 'leaf'); if (n > 0.5) tree(c, px + 12, py + 15, 10, y < 40 ? 'pine' : 'leaf'); }
    else if (t === 'tog') { c.fillStyle = '#6f685e'; c.beginPath(); c.moveTo(px, py + 15); c.lineTo(px + 8, py + 2); c.lineTo(px + 16, py + 15); c.fill(); c.fillStyle = '#f1efe9'; c.beginPath(); c.moveTo(px + 5, py + 6); c.lineTo(px + 8, py + 2); c.lineTo(px + 11, py + 6); c.fill(); }
    else if (t === 'chol' && n > 0.6) { c.strokeStyle = 'rgba(150,110,50,0.5)'; c.beginPath(); c.arc(px + 8, py + 14, 7, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    else if (t === 'daryo') { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(px + 2, py + 8); c.quadraticCurveTo(px + 6, py + 5, px + 10, py + 8); c.stroke(); }
    else if (t === 'tekislik' && n > 0.82) { c.fillStyle = 'rgba(70,110,40,0.5)'; c.fillRect(px + 6, py + 6, 2, 3); }
  }
  // mintaqa chegaralari (8x8 viloyat)
  c.strokeStyle = 'rgba(30,30,30,0.12)'; c.lineWidth = 1;
  for (let i = 0; i <= MAP_SIZE; i += 8) { c.beginPath(); c.moveTo(i * TILE, 0); c.lineTo(i * TILE, S); c.moveTo(0, i * TILE); c.lineTo(S, i * TILE); c.stroke(); }
  return canvas;
}
