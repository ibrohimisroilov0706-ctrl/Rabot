// apps/client/src/lord/game.ts
// Umumiy holat: dunyo, saqlash (localStorage + Telegram CloudStorage), HUD yangilash ilgagi.

import { cloudSave } from '../offline/cloud.js';
import type { MapView } from './mapView.js';
import type { World } from './world.js';

export const SAVE_KEY = 'qrl_lord_v1';
export const G = {
  w: null as unknown as World,
  map: null as MapView | null,
  battle: false,
  hud: () => {},
};

export function save() {
  if (!G.w) return;
  const j = JSON.stringify(G.w);
  try { localStorage.setItem(SAVE_KEY, j); } catch { /* xotira to'la */ }
  cloudSave(j, 'lrd');
}

export const battleSize = () => (window.innerWidth < 640 ? 45 : 70);
