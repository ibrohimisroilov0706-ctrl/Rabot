// packages/game-rules/src/battle.ts
// Jang: server tomonida bir martalik deterministik hisob (seed = battleId).
// Kirish: BattleInput. Chiqish: BattleResult (g'olib, nisbat, har bir stack yo'qotishi, XP).

import { CULTURES } from './cultures.js';
import { clamp, rng } from './rng.js';
import type { Culture, Terrain, UnitClass, Weather } from './types.js';
import { COUNTER, unitDef } from './units.js';

export interface Stack { unitKey: string; count: number; veterancy: number } // veterancy 0..5
export interface BattleArmy {
  armyId: string;
  culture: Culture;
  stacks: Stack[];
  generalSkill: number; // 0..30
  loyalty: number; // 0..100 (S)
  fed: boolean;
  smithyLevel?: number; // temirchilik darajasi 0..10 -> hujum va mudofaa +1%/daraja
}
export interface Fortification { wallLevel: number; wallHp: number; towerLevel: number }
export interface BattleInput {
  battleId: string;
  terrain: Terrain;
  weather: Weather;
  attackers: BattleArmy[];
  defenders: BattleArmy[];
  fortification?: Fortification;
  riverCrossing?: boolean;
}
export interface StackLoss { armyId: string; unitKey: string; before: number; lost: number }
export interface BattleResult {
  winner: 'attacker' | 'defender';
  attackPower: number;
  defensePower: number;
  luck: number;
  ratio: number;
  attackerLossFrac: number;
  defenderLossFrac: number;
  losses: StackLoss[];
}

const CAV: UnitClass[] = ['otliq', 'ogir_otliq'];

const TERRAIN_ATK: Record<Terrain, Partial<Record<UnitClass | '*', number>>> = {
  tekislik: { otliq: 1.1, ogir_otliq: 1.15 },
  ormon: { otliq: 0.75, ogir_otliq: 0.7, kamonchi: 0.85, piyoda: 1.1 },
  tog: { '*': 0.85, otliq: 0.7, ogir_otliq: 0.7 },
  chol: { '*': 0.9, otliq: 1.05 },
  daryo: {},
};
export const TERRAIN_DEF: Record<Terrain, number> = { tekislik: 1, ormon: 1.15, tog: 1.25, chol: 1, daryo: 1 };
const WEATHER_ATK: Record<Weather, Partial<Record<UnitClass, number>>> = {
  ochiq: {},
  yomgir: { kamonchi: 0.8, qamal: 0.8 },
  qor: { otliq: 0.85, ogir_otliq: 0.85 },
  jazirama: { ogir_otliq: 0.9, piyoda: 0.95 },
  tuman: { kamonchi: 0.7 },
};

export const morale = (S: number, fed: boolean): number => (0.85 + 0.003 * clamp(S, 0, 100)) * (fed ? 1 : 0.7);
export const veterancyFactor = (v: number): number => 1 + 0.05 * clamp(v, 0, 5);
export const generalFactor = (g: number): number => 1 + clamp(g, 0, 35) / 100;
export const smithyFactor = (L = 0): number => 1 + 0.01 * clamp(L, 0, 10);

export function terrainAtk(cls: UnitClass, t: Terrain, c: Culture): number {
  const m = TERRAIN_ATK[t][cls] ?? TERRAIN_ATK[t]['*'] ?? 1;
  return m < 1 && CULTURES[c].bonuses.terrainAdapted.includes(t) ? 1 : m;
}
export function weatherAtk(cls: UnitClass, w: Weather, c: Culture): number {
  if (CULTURES[c].bonuses.weatherImmune.includes(w)) return 1;
  return WEATHER_ATK[w][cls] ?? 1;
}

const sideCount = (side: BattleArmy[]) => side.reduce((s, a) => s + a.stacks.reduce((x, st) => x + st.count, 0), 0);
const hasShare = (side: BattleArmy[], key: string, minShare: number) => {
  const total = sideCount(side);
  const n = side.reduce((s, a) => s + a.stacks.filter(st => st.unitKey === key).reduce((x, st) => x + st.count, 0), 0);
  return total > 0 && n / total >= minShare;
};

/** Hujumchi birlik uchun dushman tarkibiga nisbatan o'rtacha qarshi-turish ko'paytuvchisi */
function counterVs(attKey: string, enemy: BattleArmy[]): number {
  const att = unitDef(attKey);
  const total = sideCount(enemy);
  if (total === 0) return 1;
  let acc = 0;
  for (const a of enemy) for (const st of a.stacks) {
    const def = unitDef(st.unitKey);
    let m = COUNTER[att.cls]?.[def.cls] ?? 1;
    if (att.cls === 'nayzachi' && st.unitKey === 'manggut') m = 1 + (m - 1) / 2; // Mang'ut maxsus qoidasi
    acc += (st.count / total) * m;
  }
  return acc;
}

function attackPower(side: BattleArmy[], enemy: BattleArmy[], inp: BattleInput, enemyIsDefender: boolean): number {
  // Dushman otliq hujumiga jarima: fil (har doim) yoki uzun kamonchi (faqat himoyada) >= 10% bo'lsa
  const cavPenalty = hasShare(enemy, 'jangovar_fil', 0.1) || (enemyIsDefender && hasShare(enemy, 'uzun_kamonchi', 0.1)) ? 0.9 : 1;
  let p = 0;
  for (const a of side) {
    const gBonus = a.stacks.some(s => s.unitKey === 'bahodir') ? 5 : 0;
    for (const st of a.stacks) {
      const u = unitDef(st.unitKey);
      let m = u.attack * (1 + (CULTURES[a.culture].bonuses.unitAttack[u.cls] ?? 0));
      m *= counterVs(st.unitKey, enemy) * terrainAtk(u.cls, inp.terrain, a.culture) * weatherAtk(u.cls, inp.weather, a.culture);
      if (CAV.includes(u.cls)) m *= cavPenalty;
      if (st.unitKey === 'ovchi' && inp.terrain === 'ormon') m *= 1.2;
      if (st.unitKey === 'ritsar' && inp.terrain === 'tekislik') m *= 1.1;
      if (st.unitKey === 'jangovar_fil' && inp.terrain === 'ormon') m *= 0.7;
      m *= veterancyFactor(st.veterancy) * generalFactor(a.generalSkill + gBonus) * morale(a.loyalty, a.fed) * smithyFactor(a.smithyLevel);
      p += st.count * m;
    }
  }
  return enemyIsDefender && inp.riverCrossing ? p * 0.7 : p;
}

function defensePower(side: BattleArmy[], enemy: BattleArmy[], inp: BattleInput): { power: number; tower: number } {
  const f = inp.fortification;
  const wallUp = !!f && f.wallHp > 0;
  const wallFactor = wallUp ? 1 + 0.08 * f!.wallLevel : 1;
  const fieldFort = !f && side.some(a => a.stacks.some(s => s.unitKey === 'xitoy_manjaniq' && s.count > 0)) ? 1.15 : 1;
  let p = 0;
  for (const a of side) {
    for (const st of a.stacks) {
      const u = unitDef(st.unitKey);
      let m = u.defense * (1 + (CULTURES[a.culture].bonuses.unitDefense[u.cls] ?? 0));
      if (st.unitKey === 'drujina' && (wallUp || inp.terrain === 'ormon')) m *= 1.1;
      m *= TERRAIN_DEF[inp.terrain] * veterancyFactor(st.veterancy) * generalFactor(a.generalSkill) * morale(a.loyalty, a.fed) * smithyFactor(a.smithyLevel);
      p += st.count * m * wallFactor * fieldFort;
    }
  }
  const towerL = f ? Math.max(0, f.towerLevel - (hasShare(enemy, 'shohi_top', 0.000001) ? 1 : 0)) : 0;
  return { power: p, tower: 60 * towerL };
}

/** Yo'qotish ulushlari: g'olib = 0.5 / r^1.5 ; mag'lub = 1 - 0.5 / r ; r >= 10 -> mag'lub to'liq yo'q bo'ladi */
export function lossFractions(rPrime: number): { winner: number; loser: number } {
  const r = Math.max(1, rPrime);
  const loser = r >= 10 ? 1 : 1 - 0.5 / r;
  return { winner: 0.5 / r ** 1.5, loser };
}

export function resolveBattle(inp: BattleInput): BattleResult {
  const luck = 0.95 + 0.1 * rng(`battle:${inp.battleId}`)();
  const AP = attackPower(inp.attackers, inp.defenders, inp, true);
  const D = defensePower(inp.defenders, inp.attackers, inp);
  const DP = D.power + D.tower;
  const ratio = DP === 0 ? Infinity : (AP * luck) / DP;
  const winner = ratio > 1 ? 'attacker' : 'defender'; // durang -> himoyachi
  const rPrime = ratio === Infinity ? 10 : ratio === 0 ? 10 : Math.max(ratio, 1 / ratio);
  const lf = lossFractions(rPrime);
  const attFrac = winner === 'attacker' ? lf.winner : lf.loser;
  const defFrac = winner === 'defender' ? lf.winner : lf.loser;
  const losses: StackLoss[] = [];
  for (const [side, frac] of [[inp.attackers, attFrac], [inp.defenders, defFrac]] as const) {
    for (const a of side) for (const st of a.stacks) {
      losses.push({ armyId: a.armyId, unitKey: st.unitKey, before: st.count, lost: Math.min(st.count, Math.round(st.count * frac)) });
    }
  }
  return { winner, attackPower: AP, defensePower: DP, luck, ratio, attackerLossFrac: attFrac, defenderLossFrac: defFrac, losses };
}

/** Devor HP: 1000 * 1.5^(L-1) * (1 + madaniyat bonusi) */
export const wallMaxHp = (level: number, c: Culture): number =>
  level <= 0 ? 0 : Math.round(1000 * 1.5 ** (level - 1) * (1 + CULTURES[c].bonuses.wallHp));

/** Qamal: soatiga devorga zarar = sum(n * siege) * (1 + qamal bonusi) * ob-havo */
export function siegeDamagePerHour(stacks: Stack[], c: Culture, w: Weather): number {
  return stacks.reduce((s, st) => {
    const u = unitDef(st.unitKey);
    return s + st.count * u.siege * (1 + CULTURES[c].bonuses.siegeDamage) * weatherAtk(u.cls, w, c);
  }, 0);
}

/** XP: g'alaba +10, mag'lubiyat +3; veteranlik = min(5, floor(xp/30)) */
export const xpGain = (won: boolean): number => (won ? 10 : 3);
export const veterancyFromXp = (xp: number): number => Math.min(5, Math.floor(xp / 30));
