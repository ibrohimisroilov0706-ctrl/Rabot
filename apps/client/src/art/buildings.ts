// apps/client/src/art/buildings.ts
// Har bir millat uchun alohida uslubdagi binolar (03 Millatlar tabi). Natija: canvas (Phaser teksturasi yoki DOM ikonka).

import type { BuildingKey, Culture } from '@qirolliklar/game-rules';
import {
  crenels, dome, flag, gableRoof, ground, isoBox, minaret, onionDome, pagodaRoof, pishtaq, ribbedDome, shade, tree, yurt, type Ctx,
} from './kit.js';

export const PALETTE: Record<Culture, { wall: string; roof: string; accent: string; tile: string; gold: string; ground: string; flag: string }> = {
  temuriy: { wall: '#d9c29b', roof: '#1f8a9e', accent: '#1e3f8c', tile: '#1f8a9e', gold: '#d4a537', ground: '#c8b07a', flag: '#1e3f8c' },
  usmonli: { wall: '#ece4d3', roof: '#7d8b94', accent: '#c8102e', tile: '#2a7fb0', gold: '#d4a537', ground: '#9fb07a', flag: '#c8102e' },
  rus: { wall: '#8b5a2b', roof: '#5a3a1e', accent: '#9e2a2b', tile: '#2a5b9e', gold: '#c9a227', ground: '#7d9a5f', flag: '#9e2a2b' },
  ingliz: { wall: '#9d978c', roof: '#4a4f57', accent: '#b22234', tile: '#1f2a44', gold: '#c9a227', ground: '#7fa36a', flag: '#b22234' },
  mogul: { wall: '#efe6d2', roof: '#555d66', accent: '#a61b1b', tile: '#3a7bd5', gold: '#d4a537', ground: '#a9b678', flag: '#3a7bd5' },
};

export const TEX_W = 160;
export const TEX_H = 160;

function palace(c: Ctx, cu: Culture, L: number, cx: number, by: number) {
  const p = PALETTE[cu];
  const s = 0.85 + L * 0.03;
  if (cu === 'temuriy') {
    isoBox(c, cx, by, 110 * s, 60 * s, 34 * s, p.wall);
    minaret(c, cx - 50 * s, by - 10, 70 * s, 8 * s, p.wall, 'flat', p.tile);
    minaret(c, cx + 50 * s, by - 10, 70 * s, 8 * s, p.wall, 'flat', p.tile);
    ribbedDome(c, cx + 22 * s, by - 48 * s, 18 * s, p.tile, 10, p.gold);
    pishtaq(c, cx - 8 * s, by - 6, 46 * s, 66 * s, p.wall, p.accent, p.gold);
  } else if (cu === 'usmonli') {
    isoBox(c, cx, by, 104 * s, 60 * s, 30 * s, p.wall);
    for (const dx of [-30, 30]) dome(c, cx + dx * s, by - 42 * s, 12 * s, p.roof, p.gold);
    dome(c, cx, by - 46 * s, 26 * s, p.roof, p.gold);
    for (const dx of [-52, 52]) minaret(c, cx + dx * s, by - 8, 82 * s, 6 * s, p.wall, 'pencil', p.accent);
  } else if (cu === 'rus') {
    if (L < 5) {
      isoBox(c, cx, by, 90 * s, 54 * s, 40 * s, p.wall);
      gableRoof(c, cx, by - 58 * s, 70 * s, 34 * s, p.roof);
      onionDome(c, cx, by - 90 * s, 10 * s, p.gold);
    } else {
      isoBox(c, cx, by, 100 * s, 58 * s, 40 * s, '#e8e1d3');
      for (const dx of [-24, 0, 24]) onionDome(c, cx + dx * s, by - 64 * s - (dx === 0 ? 10 : 0), (dx === 0 ? 13 : 9) * s, dx === 0 ? p.gold : p.tile);
    }
    flag(c, cx + 44 * s, by - 30 * s, p.flag);
  } else if (cu === 'ingliz') {
    isoBox(c, cx, by, 84 * s, 54 * s, 60 * s, p.wall);
    crenels(c, cx - 40 * s, by - 76 * s, 80 * s, shade(p.wall, 1.05), 7);
    for (const dx of [-46, 46]) { isoBox(c, cx + dx * s, by - 6, 20 * s, 20 * s, 76 * s, shade(p.wall, 0.95)); crenels(c, cx + dx * s - 10 * s, by - 88 * s, 20 * s, p.wall, 3); }
    flag(c, cx, by - 82 * s, p.flag, 16);
    c.fillStyle = '#2a2420'; c.fillRect(cx - 8 * s, by - 26 * s, 16 * s, 22 * s);
  } else {
    if (L < 5) {
      yurt(c, cx, by - 4, 42 * s, '#f2e3b3', p.gold);
      for (const dx of [-60, -46, 46, 60]) flag(c, cx + dx * s, by - 4, '#ffffff', 10);
    } else {
      isoBox(c, cx, by, 96 * s, 56 * s, 30 * s, '#b43a2e');
      pagodaRoof(c, cx, by - 40 * s, 110 * s, 34 * s, p.roof);
      pagodaRoof(c, cx, by - 68 * s, 70 * s, 26 * s, p.roof);
      c.fillStyle = p.gold; c.fillRect(cx - 1, by - 104 * s, 2, 12 * s);
    }
  }
}

function temple(c: Ctx, cu: Culture, L: number, cx: number, by: number) {
  const p = PALETTE[cu]; const s = 0.75 + L * 0.03;
  if (cu === 'temuriy') { isoBox(c, cx, by, 80 * s, 50 * s, 26 * s, p.wall); ribbedDome(c, cx + 10 * s, by - 36 * s, 20 * s, p.tile, 9, p.gold); pishtaq(c, cx - 14 * s, by - 4, 34 * s, 50 * s, p.wall, p.accent, p.gold); }
  else if (cu === 'usmonli') { isoBox(c, cx, by, 76 * s, 50 * s, 24 * s, p.wall); dome(c, cx, by - 36 * s, 22 * s, p.roof); minaret(c, cx + 40 * s, by - 6, 70 * s, 5 * s, p.wall, 'pencil', p.accent); }
  else if (cu === 'rus') { isoBox(c, cx, by, 56 * s, 44 * s, 44 * s, '#efe9dc'); onionDome(c, cx, by - 62 * s, 12 * s, p.tile); for (const dx of [-18, 18]) onionDome(c, cx + dx * s, by - 52 * s, 7 * s, p.gold); }
  else if (cu === 'ingliz') { isoBox(c, cx, by, 72 * s, 44 * s, 36 * s, p.wall); gableRoof(c, cx, by - 52 * s, 56 * s, 22 * s, p.roof); isoBox(c, cx + 28 * s, by - 8, 18 * s, 18 * s, 62 * s, p.wall); c.fillStyle = p.roof; c.beginPath(); c.moveTo(cx + 19 * s, by - 80 * s); c.lineTo(cx + 28 * s, by - 118 * s); c.lineTo(cx + 37 * s, by - 80 * s); c.fill(); }
  else { isoBox(c, cx, by, 54 * s, 40 * s, 22 * s, '#b43a2e'); pagodaRoof(c, cx, by - 30 * s, 72 * s, 22 * s, p.roof); pagodaRoof(c, cx, by - 50 * s, 52 * s, 18 * s, p.roof); pagodaRoof(c, cx, by - 66 * s, 34 * s, 14 * s, p.roof); }
}

function generic(c: Ctx, cu: Culture, key: BuildingKey, L: number, cx: number, by: number) {
  const p = PALETTE[cu]; const s = 0.7 + L * 0.025;
  const wall = cu === 'rus' ? p.wall : cu === 'mogul' ? '#e9dcc0' : p.wall;
  switch (key) {
    case 'ferma': {
      c.fillStyle = '#d8b24a';
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(cx - 60 + i * 10, by - 6 + i * 5); c.lineTo(cx - 20 + i * 10, by - 26 + i * 5); c.lineTo(cx - 14 + i * 10, by - 23 + i * 5); c.lineTo(cx - 54 + i * 10, by - 3 + i * 5); c.fill(); }
      isoBox(c, cx + 26, by - 6, 36 * s, 30 * s, 20 * s, wall); gableRoof(c, cx + 26, by - 30 * s, 34 * s, 16 * s, cu === 'temuriy' ? '#a88452' : p.roof);
      return;
    }
    case 'yogoch': isoBox(c, cx + 10, by, 40 * s, 30 * s, 18 * s, '#8b5a2b'); for (const [dx, dy] of [[-40, -4], [-28, 4], [36, -10]]) tree(c, cx + dx!, by + dy!, 38, cu === 'rus' ? 'pine' : 'leaf'); c.fillStyle = '#a0703a'; for (let i = 0; i < 3; i++) c.fillRect(cx - 20, by - 8 - i * 5, 28, 4); return;
    case 'tosh_kon': c.fillStyle = '#8d8a85'; c.beginPath(); c.moveTo(cx - 56, by); c.lineTo(cx - 20, by - 50); c.lineTo(cx + 10, by - 24); c.lineTo(cx + 40, by - 44); c.lineTo(cx + 60, by); c.fill(); c.fillStyle = '#6d6a66'; c.fillRect(cx - 10, by - 16, 20, 16); return;
    case 'temir_kon': c.fillStyle = '#5d5650'; c.beginPath(); c.moveTo(cx - 56, by); c.lineTo(cx - 10, by - 54); c.lineTo(cx + 56, by); c.fill(); c.fillStyle = '#1b1612'; c.beginPath(); c.arc(cx, by - 10, 12, Math.PI, 0); c.fill(); c.fillStyle = '#b55d2a'; c.fillRect(cx + 20, by - 12, 14, 8); return;
    case 'mahalla': for (const [dx, dy, hh] of [[-30, 0, 18], [6, -10, 22], [34, 6, 16]]) { isoBox(c, cx + dx!, by + dy!, 30 * s, 26 * s, hh! * s, wall); if (cu === 'temuriy' || cu === 'usmonli') { c.fillStyle = shade(wall, 1.1); c.fillRect(cx + dx! - 12 * s, by + dy! - hh! * s - 16 * s, 24 * s, 3); } else gableRoof(c, cx + dx!, by + dy! - hh! * s - 4, 28 * s, 12 * s, p.roof); } return;
    case 'devor': { const col = cu === 'rus' && L < 5 ? '#7a4f26' : cu === 'temuriy' ? '#cdb184' : cu === 'mogul' && L < 5 ? '#7a4f26' : p.wall; isoBox(c, cx, by, 120 * s, 18, 30 * s, col); crenels(c, cx - 56 * s, by - 32 * s, 54 * s, col, 5); for (const dx of [-58, 58]) isoBox(c, cx + dx * s, by - 4, 22 * s, 22 * s, 50 * s, shade(col, 0.95)); flag(c, cx, by - 34 * s, p.flag); return; }
    case 'minora': isoBox(c, cx, by, 34 * s, 34 * s, 84 * s, cu === 'temuriy' ? p.wall : p.wall); if (cu === 'rus' || cu === 'mogul') pagodaRoof(c, cx, by - 96 * s, 46 * s, 30 * s, p.roof); else if (cu === 'temuriy') ribbedDome(c, cx, by - 96 * s, 14 * s, p.tile, 7, p.gold); else crenels(c, cx - 16 * s, by - 102 * s, 32 * s, p.wall, 4); return;
    case 'bozor': if (cu === 'temuriy' || cu === 'usmonli') { isoBox(c, cx, by, 90 * s, 50 * s, 22 * s, p.wall); for (const dx of [-26, 0, 26]) dome(c, cx + dx * s, by - 30 * s, 11 * s, cu === 'temuriy' ? shade(p.wall, 1.05) : p.roof); } else { for (const [dx, col] of [[-30, '#c0392b'], [0, '#e1a33b'], [30, '#2d6a9f']] as const) { isoBox(c, cx + dx, by, 26, 22, 14, '#8b6a45'); c.fillStyle = col; c.beginPath(); c.moveTo(cx + dx - 16, by - 18); c.lineTo(cx + dx, by - 30); c.lineTo(cx + dx + 16, by - 18); c.fill(); } } return;
    case 'karvonsaroy': isoBox(c, cx, by, 100 * s, 66 * s, 24 * s, wall); c.fillStyle = shade(wall, 0.5); c.fillRect(cx - 8, by - 22 * s, 16, 18 * s); if (cu === 'temuriy') pishtaq(c, cx, by - 2, 30 * s, 40 * s, wall, p.tile, p.gold); c.fillStyle = '#b08a5a'; c.beginPath(); c.ellipse(cx + 54, by - 2, 10, 5, 0, 0, Math.PI * 2); c.fill(); return;
    case 'akademiya': if (cu === 'temuriy') { isoBox(c, cx, by, 86 * s, 54 * s, 28 * s, p.wall); pishtaq(c, cx, by - 2, 40 * s, 58 * s, p.wall, p.tile, p.gold); for (const dx of [-38, 38]) minaret(c, cx + dx * s, by - 6, 64 * s, 6 * s, p.wall, 'flat', p.tile); } else { isoBox(c, cx, by, 80 * s, 50 * s, 34 * s, p.wall); if (cu === 'usmonli') dome(c, cx, by - 44 * s, 16 * s, p.roof); else if (cu === 'mogul') pagodaRoof(c, cx, by - 44 * s, 90 * s, 26 * s, p.roof); else gableRoof(c, cx, by - 48 * s, 64 * s, 24 * s, p.roof); } return;
    default: {
      const hgt = key === 'kazarma' ? 26 : key === 'qamoqxona' ? 32 : 28;
      if (cu === 'mogul' && L < 5 && (key === 'kazarma' || key === 'otxona')) { yurt(c, cx - 22, by - 4, 22, '#efe3c0', p.gold); yurt(c, cx + 22, by + 6, 20, '#efe3c0', p.gold); }
      else {
        isoBox(c, cx, by, 84 * s, 52 * s, hgt * s, wall);
        if (cu === 'usmonli') dome(c, cx, by - (hgt + 12) * s, 12 * s, p.roof);
        else if (cu === 'temuriy') { c.fillStyle = p.tile; c.fillRect(cx - 34 * s, by - (hgt + 18) * s, 68 * s, 4); }
        else if (cu === 'mogul') pagodaRoof(c, cx, by - (hgt + 14) * s, 92 * s, 22 * s, p.roof);
        else gableRoof(c, cx, by - (hgt + 18) * s, 70 * s, 22 * s, p.roof);
      }
      if (key === 'kazarma' || key === 'temirchilik') flag(c, cx + 36 * s, by - 10, p.flag);
      if (key === 'otxona') { c.fillStyle = '#6b4423'; c.beginPath(); c.ellipse(cx - 44, by + 4, 9, 5, 0, 0, Math.PI * 2); c.fill(); }
      if (key === 'temirchilik') { c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(cx - 10, by - 10, 4, 0, Math.PI * 2); c.fill(); }
      if (key === 'ustaxona') { c.strokeStyle = '#5b3a1e'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + 40, by); c.lineTo(cx + 60, by - 40); c.stroke(); }
      if (key === 'qamoqxona') { c.fillStyle = '#222'; for (let i = 0; i < 3; i++) c.fillRect(cx - 20 + i * 8, by - 22, 2, 12); }
      if (key === 'elchixona') flag(c, cx - 30 * s, by - 20 * s, '#ffffff');
    }
  }
}

/** Bitta binoni o'z canvasiga chizadi (TEX_W x TEX_H), asosi pastki markazda */
export function drawBuilding(canvas: HTMLCanvasElement, cu: Culture, key: BuildingKey, level: number) {
  canvas.width = TEX_W; canvas.height = TEX_H;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, TEX_W, TEX_H);
  const cx = TEX_W / 2, by = TEX_H - 30;
  ground(c, cx, by + 6, 140, PALETTE[cu].ground);
  const L = Math.max(1, level);
  if (key === 'saroy') palace(c, cu, L, cx, by);
  else if (key === 'ibodatxona') temple(c, cu, L, cx, by);
  else generic(c, cu, key, L, cx, by);
  if (level === 0) { c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(0, 0, TEX_W, TEX_H); c.strokeStyle = '#8b5a2b'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(30 + i * 30, by); c.lineTo(30 + i * 30, by - 70); c.stroke(); } }
  return canvas;
}

export function buildingIcon(cu: Culture, key: BuildingKey, level: number, size = 64): HTMLCanvasElement {
  const big = drawBuilding(document.createElement('canvas'), cu, key, level);
  const out = document.createElement('canvas'); out.width = size; out.height = size;
  out.getContext('2d')!.drawImage(big, 0, 0, size, size);
  return out;
}
