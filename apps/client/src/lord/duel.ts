// apps/client/src/lord/duel.ts
// Do'st bilan jang (internetsiz): qo'shin "kod" bo'lib uzatiladi, jang ikkala telefonda bir xil hisoblanadi.
// 1) A chaqiruv kodi yaratadi -> 2) B kodni kiritadi, jang ko'radi, javob kodi oladi -> 3) A javobni kiritadi.

import { hashSeed } from '@qirolliklar/game-rules';
import type { Culture } from '@qirolliklar/game-rules';
import type { BattleSetup } from './battle.js';
import { troop } from './data.js';
import { player, type World } from './world.js';

export interface DuelSide { name: string; cu: Culture; lvl: number; troops: [string, number][] }
type Payload = { k: 'c'; id: string; a: DuelSide } | { k: 'r'; id: string; a: DuelSide; b: DuelSide };

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encode(p: Payload): string { const j = JSON.stringify(p); return `QRL2.${b64(j)}.${hashSeed(`qrl2:${j}`).toString(36)}`; }
export function decode(code: string): Payload {
  const m = code.trim().replace(/\s+/g, '').match(/^QRL2\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/);
  if (!m) throw new Error("Kod noto'g'ri (QRL2. bilan boshlanishi kerak)");
  let j: string; try { j = unb64(m[1]!); } catch { throw new Error("Kod buzilgan"); }
  if (hashSeed(`qrl2:${j}`).toString(36) !== m[2]) throw new Error("Kod o'zgartirilgan yoki to'liq ko'chirilmagan");
  const p = JSON.parse(j) as Payload;
  for (const s of p.k === 'c' ? [p.a] : [p.a, p.b]) for (const [id, n] of s.troops) { troop(id); if (!(n > 0 && n <= 500)) throw new Error("Kodda noto'g'ri qo'shin"); }
  return p;
}

export function mySide(w: World): DuelSide {
  const pl = player(w);
  return { name: w.player.name, cu: w.player.cu, lvl: w.player.level, troops: pl.troops.filter(s => s.n - s.w > 0).map(s => [s.id, s.n - s.w]) };
}

export function duelSetup(id: string, a: DuelSide, b: DuelSide): BattleSetup {
  const side = (s: DuelSide) => ({ name: s.name, cu: s.cu, ai: true, hero: { name: s.name, level: s.lvl }, stacks: s.troops.map(([id2, n]) => ({ id: id2, n })) });
  return { seed: `duel:${id}`, terrain: 'tekislik', weather: 'ochiq', siege: false, size: 45, sides: [side(a), side(b)] };
}

export function newChallenge(w: World): string {
  const a = mySide(w);
  if (!a.troops.length) throw new Error("Jang uchun sog' askar kerak");
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const ww = w as World & { pend?: { id: string; a: DuelSide }[] };
  ww.pend = [...(ww.pend ?? []).slice(-4), { id, a }];
  return encode({ k: 'c', id, a });
}

export function takePending(w: World, id: string): DuelSide | null {
  const ww = w as World & { pend?: { id: string; a: DuelSide }[] };
  const p = ww.pend?.find(x => x.id === id); return p ? p.a : null;
}
export function dropPending(w: World, id: string) {
  const ww = w as World & { pend?: { id: string; a: DuelSide }[] };
  ww.pend = (ww.pend ?? []).filter(x => x.id !== id);
}
