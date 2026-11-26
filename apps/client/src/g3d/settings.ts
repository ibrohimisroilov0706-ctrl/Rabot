// apps/client/src/g3d/settings.ts
// 3D rejim sozlamalari va statistikasi (localStorage).

import type { CivKey } from './civs.js';

export interface Settings3D { quality: 'low' | 'mid' | 'high'; sens: number; invertY: boolean; dayCycle: boolean; showHints: boolean }
export interface Profile3D { civ: CivKey | null; kills: number; wins: number; losses: number; best: number; settings: Settings3D }
const KEY = 'qrl3d_v1';
const DEF: Profile3D = { civ: null, kills: 0, wins: 0, losses: 0, best: 0, settings: { quality: 'mid', sens: 1, invertY: false, dayCycle: true, showHints: true } };

export function loadProfile(): Profile3D {
  try { const o = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (o) return { ...DEF, ...o, settings: { ...DEF.settings, ...(o.settings ?? {}) } }; } catch { /* */ }
  return JSON.parse(JSON.stringify(DEF)) as Profile3D;
}
export function saveProfile(p: Profile3D) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } }
