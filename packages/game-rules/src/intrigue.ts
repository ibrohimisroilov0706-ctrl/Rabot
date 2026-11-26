// packages/game-rules/src/intrigue.ts
// Suiqasd va merosxo'rlik. Barchasi faqat o'yin ichidagi virtual qahramonlarga tegishli.

import { clamp, rng } from './rng.js';

export interface KingLocation {
  kingdomId: string;
  ownPalaceCityId: string;
  currentCityId: string; // qirol hozir qaysi saroyda
  alive: boolean;
}

export type EligibilityError = 'self_target' | 'target_dead' | 'not_guest' | 'cooldown';

/**
 * Qoidalar:
 *  A1. Nishon faqat MEHMON qirol bo'lishi mumkin: currentCityId != ownPalaceCityId.
 *  A2. Saroy egasi o'z saroyida (mehmon kutayotganda ham) hech qachon nishon emas - A1 dan kelib chiqadi.
 *  A3. Bir nishonga bir tashkilotchidan 24 soatda bitta urinish.
 */
export function assassinationEligibility(organizerKingdomId: string, target: KingLocation, lastAttemptMs: number | null, nowMs: number): EligibilityError | null {
  if (organizerKingdomId === target.kingdomId) return 'self_target';
  if (!target.alive) return 'target_dead';
  if (target.currentCityId === target.ownPalaceCityId) return 'not_guest';
  if (lastAttemptMs !== null && nowMs - lastAttemptMs < 24 * 3_600_000) return 'cooldown';
  return null;
}

/** Xavfsizlik s = 5*L_saroy(xost) + 4*eskort + 10*[xost himoya kafolati berdi] + 3*L_qamoqxona(xost) */
export const targetSecurity = (hostPalaceL: number, escortL: number, hostGuarantee: boolean, hostPrisonL: number): number =>
  5 * hostPalaceL + 4 * escortL + (hostGuarantee ? 10 : 0) + 3 * hostPrisonL;

/** P_muvaffaqiyat = clamp(0.25 + (a - s)/200 + 0.10*z, 0.03, 0.55) ; z = tayyorgarlik 0..1 */
export const assassinationSuccess = (agentSkill: number, security: number, prep: number): number =>
  clamp(0.25 + (agentSkill - security) / 200 + 0.1 * clamp(prep, 0, 1), 0.03, 0.55);

/** Muvaffaqiyatsizlikda fosh bo'lish: P = clamp(0.60 - (a - s)/200 - 0.20*z, 0.10, 0.90) */
export const exposureChance = (agentSkill: number, security: number, prep: number): number =>
  clamp(0.6 - (agentSkill - security) / 200 - 0.2 * clamp(prep, 0, 1), 0.1, 0.9);

export function resolveAssassination(attemptId: string, agentSkill: number, security: number, prep: number) {
  const r = rng(`assassination:${attemptId}`);
  const pS = assassinationSuccess(agentSkill, security, prep);
  const roll1 = r();
  if (roll1 < pS) return { success: true as const, exposed: false, pSuccess: pS, roll1 };
  const pE = exposureChance(agentSkill, security, prep);
  const roll2 = r();
  return { success: false as const, exposed: roll2 < pE, pSuccess: pS, pExposure: pE, roll1, roll2 };
}

// ---------------- Merosxo'rlik ----------------

export const ADULT_AGE = 16;
export const GAME_YEAR_MS = 24 * 3_600_000; // 1 o'yin yili = 1 real kun

export interface Heir { id: string; birthMs: number; orderRank: number; alive: boolean; legitimacy: number }

export const ageYears = (h: Heir, nowMs: number): number => Math.floor((nowMs - h.birthMs) / GAME_YEAR_MS);

export type SuccessionResult =
  | { kind: 'crowned'; heirId: string }
  | { kind: 'regency'; heirId: string; regencyEndsMs: number }
  | { kind: 'crisis'; civilWar: boolean };

/**
 * V1. Tirik merosxo'rlar orderRank bo'yicha (1 = birinchi) saralanadi.
 * V2. Birinchi merosxo'r katta (>=16) bo'lsa -> toj kiyadi.
 * V3. Birinchi merosxo'r voyaga yetmagan bo'lsa -> regentlik, u 16 yoshga to'lguncha.
 *     (Ikkinchi navbatdagi katta merosxo'r taxtni olmaydi: tartib qat'iy.)
 * V4. Merosxo'r yo'q -> taxt inqirozi. O'rtacha zodagon sadoqati < 40 -> fuqarolar urushi.
 */
export function resolveSuccession(heirs: Heir[], nowMs: number, avgNobleLoyalty: number): SuccessionResult {
  const alive = heirs.filter(h => h.alive).sort((a, b) => a.orderRank - b.orderRank);
  const first = alive[0];
  if (!first) return { kind: 'crisis', civilWar: avgNobleLoyalty < 40 };
  const age = ageYears(first, nowMs);
  if (age >= ADULT_AGE) return { kind: 'crowned', heirId: first.id };
  return { kind: 'regency', heirId: first.id, regencyEndsMs: first.birthMs + ADULT_AGE * GAME_YEAR_MS };
}
