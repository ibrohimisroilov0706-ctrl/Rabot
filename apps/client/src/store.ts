// apps/client/src/store.ts
// Ilova holati: /api/me javobi + obunachilar. Resurslar tezlik bo'yicha klientda interpolyatsiya qilinadi
// (faqat ko'rsatish uchun; haqiqiy qiymat har doim serverdan keladi).

import type { Culture } from '@qirolliklar/game-rules';
import { api } from './api.js';

export interface Me {
  serverTime: string;
  gameSpeed: number;
  kingdom: null | {
    id: string; name: string; culture: Culture; rulerName: string; generation: number; reputation: number; nobleLoyalty: number;
    kingCityId: string; capitalCityId: string; shieldUntil: string | null; regentUntil: string | null; traitorUntil: string | null; guestKillerUntil: string | null;
  };
  city: {
    id: string; name: string; x: number; y: number; population: number; populationCap: number; taxPct: number; happiness: number; wallHp: number;
    tier: string; slots: number; resources: Record<string, number>; caps: Record<string, number>; perHour: Record<string, number>;
    workerFactor: number; upkeep: { food: number; gold: number }; buildings: { id: string; key: any; level: number; slot: number }[];
  };
  queue: { id: string; key: any; building_id: string; target_level: number; finishes_at: string }[];
  recruits: { id: string; unit_key: string; count: number; due_at: string }[];
  commanders: { id: string; name: string; skill: number; prestige: number; wins: number; losses: number }[];
  armies: any[];
  services: any[];
  intrigue: { agents: any[]; heirs: any[]; guests: any[]; visitingKings: any[] };
  unread: number;
}

type Listener = (me: Me) => void;
const listeners = new Set<Listener>();
export let me: Me | null = null;
let fetchedAt = 0;
let inflight: Promise<Me> | null = null;

export function subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }

export async function refresh(): Promise<Me> {
  if (inflight) return inflight;
  inflight = api<Me>('GET', '/api/me').then(m => {
    me = m; fetchedAt = Date.now();
    listeners.forEach(f => f(m));
    return m;
  }).finally(() => { inflight = null; });
  return inflight;
}

/** Ko'rsatish uchun joriy resurs qiymati (oxirgi so'rovdan beri o'tgan o'yin vaqti hisobga olinadi) */
export function liveResource(k: string): number {
  if (!me?.city) return 0;
  const hours = ((Date.now() - fetchedAt) / 3_600_000) * (me.gameSpeed ?? 1);
  const v = me.city.resources[k]! + me.city.perHour[k]! * hours;
  return Math.max(0, Math.min(me.city.caps[k] ?? Infinity, v));
}
