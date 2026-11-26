// packages/game-rules/src/loyalty.ts
// Milliyat va qo'shin sadoqati - o'yinning asosiy mexanikasi.
// Kirish: ServiceRecord (xizmatdagi qo'shin holati). Chiqish: LoyaltyOutcome (hodisa turi + yangi holat).
//
// Qoidalar (GDD 5-bo'lim):
//  R1. Qo'shin madaniyati = xizmat qilayotgan qirollik madaniyati -> milliy G/M tekshiruvi umuman ishlamaydi.
//  R2. Boshqa millat, N = W + L >= N_MIN va L > W -> askarlarning aniq 50% i tarqaladi.
//  R3. Boshqa millat, N >= N_MIN va W > L -> mustaqillik hodisasi: urush yoki tinch mustaqillik (S ga bog'liq).
//  R4. Boshqa millat, N >= N_MIN va W = L -> sadoqat tekshiruvi (S bo'yicha 0% / 10% / 25% tarqalish).
//  R5. Maosh, oziq, general obro'si, siyosiy munosabat -> S orqali R3/R4 ga va iqtisodiy tarqalishga ta'sir qiladi.
//  R6. R2, R3 yoki R4 da yo'qotish bo'lsa W va L 0 ga tushadi (yangi davr). Aks holda hisob davom etadi.
//  R7. Iqtisodiy tarqalish (barcha qo'shinlar, millatdan qat'i nazar) - ochlik >= 24 soat yoki maosh to'lanmagan >= 48 soat.

import { clamp, rng } from './rng.js';
import type { Culture } from './types.js';

export const N_MIN = 3;
export const DESERT_SHARE_DEFEAT = 0.5;

export interface LoyaltyInputs {
  payRatio: number; // oxirgi 7 kunda to'langan / kelishilgan maosh (0..)
  foodRatio: number; // oxirgi 24 soatda berilgan / kerakli oziq (0..1)
  generalPrestige: number; // 0..100
  relation: number; // xost va qo'shin egasi orasidagi ishonch -100..100
  sameCulture: boolean;
  generosityActive: boolean; // "Saxiylik" bonusi (72 soat)
  eliteBonus: number; // masalan yangicheri ulushi bo'yicha 0..10
}

/**
 * Sadoqat S (0..100):
 * S = clamp(50 + P_pay + P_food + P_gen + P_rel + P_cul + P_sax + P_elite, 0, 100)
 *   P_pay  = 30*(min(r_p,1) - 1) + 20*min(max(r_p-1,0), 0.5)   -> [-30, +10]
 *   P_food = 40*(min(r_f,1) - 1)                                -> [-40, 0]
 *   P_gen  = 0.2*(G - 50)                                       -> [-10, +10]
 *   P_rel  = 0.15*R                                             -> [-15, +15]
 *   P_cul  = +10 agar millat bir xil
 *   P_sax  = +20 agar Saxiylik faol
 */
export function loyaltyScore(i: LoyaltyInputs): number {
  const pPay = 30 * (Math.min(i.payRatio, 1) - 1) + 20 * Math.min(Math.max(i.payRatio - 1, 0), 0.5);
  const pFood = 40 * (Math.min(i.foodRatio, 1) - 1);
  const pGen = 0.2 * (clamp(i.generalPrestige, 0, 100) - 50);
  const pRel = 0.15 * clamp(i.relation, -100, 100);
  const pCul = i.sameCulture ? 10 : 0;
  const pSax = i.generosityActive ? 20 : 0;
  return clamp(50 + pPay + pFood + pGen + pRel + pCul + pSax + clamp(i.eliteBonus, 0, 10), 0, 100);
}

/** Urush ehtimoli mustaqillik hodisasida: p_war = clamp(0.5 - (S-50)/100, 0.1, 0.9) */
export const warProbability = (S: number): number => clamp(0.5 - (S - 50) / 100, 0.1, 0.9);

/** Teng holatdagi tarqalish ulushi: S>=60 -> 0 ; 40<=S<60 -> 0.10 ; S<40 -> 0.25 */
export const tieDesertShare = (S: number): number => (S >= 60 ? 0 : S >= 40 ? 0.1 : 0.25);

/** Iqtisodiy tarqalish (kunlik): e = 0.10*(1 - S/100), faqat ochlik/maoshsizlik shartida */
export const economicDailyDesertShare = (S: number): number => 0.1 * (1 - clamp(S, 0, 100) / 100);

export interface ServiceRecord {
  serviceId: string;
  armyCulture: Culture;
  hostCulture: Culture;
  wins: number;
  losses: number;
  soldiers: Record<string, number>; // unitKey -> soni
  loyalty: number; // hisoblangan S
}

export type LoyaltyEvent =
  | { type: 'none'; reason: 'same_culture' | 'below_min' | 'tie_passed' }
  | { type: 'desertion'; rule: 'R2' | 'R4'; share: number; deserted: Record<string, number> }
  | { type: 'independence'; outcome: 'war' | 'peaceful'; pWar: number; roll: number };

export interface LoyaltyOutcome { event: LoyaltyEvent; next: ServiceRecord }

/** Har bir urushdan (yoki xizmat shartnomasi tugashidan) keyin chaqiriladi. evalKey = battleId (deterministik roll). */
export function evaluateServiceLoyalty(rec: ServiceRecord, evalKey: string): LoyaltyOutcome {
  if (rec.armyCulture === rec.hostCulture) return { event: { type: 'none', reason: 'same_culture' }, next: rec };
  const N = rec.wins + rec.losses;
  if (N < N_MIN) return { event: { type: 'none', reason: 'below_min' }, next: rec };

  const desert = (share: number) => {
    const deserted: Record<string, number> = {};
    const left: Record<string, number> = {};
    for (const [k, n] of Object.entries(rec.soldiers)) {
      deserted[k] = Math.floor(n * share);
      left[k] = n - deserted[k]!;
    }
    return { deserted, left };
  };

  if (rec.losses > rec.wins) {
    const { deserted, left } = desert(DESERT_SHARE_DEFEAT);
    return { event: { type: 'desertion', rule: 'R2', share: DESERT_SHARE_DEFEAT, deserted }, next: { ...rec, soldiers: left, wins: 0, losses: 0 } };
  }
  if (rec.wins > rec.losses) {
    const pWar = warProbability(rec.loyalty);
    const roll = rng(`loyalty:${rec.serviceId}:${evalKey}`)();
    return { event: { type: 'independence', outcome: roll < pWar ? 'war' : 'peaceful', pWar, roll }, next: { ...rec, wins: 0, losses: 0 } };
  }
  const share = tieDesertShare(rec.loyalty);
  if (share === 0) return { event: { type: 'none', reason: 'tie_passed' }, next: rec };
  const { deserted, left } = desert(share);
  return { event: { type: 'desertion', rule: 'R4', share, deserted }, next: { ...rec, soldiers: left, wins: 0, losses: 0 } };
}
