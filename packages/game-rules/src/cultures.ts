// packages/game-rules/src/cultures.ts
// Millat bonuslari: yagona manba (single source of truth). Server, klient va balans testlari shu fayldan o'qiydi.
// Qoida: har bir millatda kuchli tomonlar = +40 ball, zaif tomonlar = -10 ball, sof byudjet = 30 ball.

import type { Culture, ResourceKey, Terrain, UnitClass, Weather } from './types.js';

export interface CultureBonuses {
  production: Partial<Record<ResourceKey, number>>; // 0.20 = +20%
  buildTime: number; // -0.10 = qurilish 10% tezroq
  wallHp: number;
  tradeIncome: number;
  marchSpeed: number;
  riverSpeed: number;
  unitAttack: Partial<Record<UnitClass, number>>;
  unitDefense: Partial<Record<UnitClass, number>>;
  unitCost: Partial<Record<UnitClass, number>>;
  upkeepGold: number;
  siegeDamage: number;
  researchSpeed: number;
  trustGain: number;
  popGrowth: number;
  weatherImmune: Weather[];
  terrainAdapted: Terrain[];
}

export interface BonusLine { text: string; points: number }

export interface CultureDef {
  key: Culture;
  name: string;
  bonuses: CultureBonuses;
  ledger: BonusLine[]; // balans byudjeti hisobi
}

const base = (): CultureBonuses => ({
  production: {}, buildTime: 0, wallHp: 0, tradeIncome: 0, marchSpeed: 0, riverSpeed: 0,
  unitAttack: {}, unitDefense: {}, unitCost: {}, upkeepGold: 0, siegeDamage: 0,
  researchSpeed: 0, trustGain: 0, popGrowth: 0, weatherImmune: [], terrainAdapted: [],
});

export const CULTURES: Record<Culture, CultureDef> = {
  rus: {
    key: 'rus', name: 'Ruslar',
    bonuses: { ...base(), production: { wood: 0.2 }, wallHp: 0.2,
      unitDefense: { piyoda: 0.1, nayzachi: 0.1 }, weatherImmune: ['qor'], terrainAdapted: ['ormon'],
      tradeIncome: -0.1, unitCost: { otliq: 0.1, ogir_otliq: 0.1 } },
    ledger: [
      { text: "Yog'och ishlab chiqarish +20%", points: 10 },
      { text: 'Devor HP +20%', points: 10 },
      { text: 'Piyoda va nayzachi mudofaasi +10%', points: 10 },
      { text: "Qor jarimasi yo'q, o'rmonga moslashgan", points: 10 },
      { text: 'Savdo daromadi -10%', points: -5 },
      { text: 'Otliq narxi +10%', points: -5 },
    ],
  },
  ingliz: {
    key: 'ingliz', name: 'Inglizlar',
    bonuses: { ...base(), tradeIncome: 0.2, unitAttack: { kamonchi: 0.15, otliq: -0.1 },
      riverSpeed: 0.25, production: { stone: 0.2, food: -0.1 }, weatherImmune: ['tuman', 'yomgir'] },
    ledger: [
      { text: 'Savdo daromadi +20%', points: 10 },
      { text: 'Kamonchi hujumi +15%', points: 10 },
      { text: 'Tosh ishlab chiqarish +20%', points: 10 },
      { text: "Daryo bo'ylab yurish +25%, tuman va yomg'ir jarimasi yo'q", points: 10 },
      { text: 'Otliq hujumi -10%', points: -5 },
      { text: 'Oziq-ovqat ishlab chiqarish -10%', points: -5 },
    ],
  },
  usmonli: {
    key: 'usmonli', name: 'Usmonli turklar',
    bonuses: { ...base(), siegeDamage: 0.25, trustGain: 0.25, unitAttack: { piyoda: 0.1 },
      production: { gold: 0.1 }, upkeepGold: 0.1, unitDefense: { otliq: -0.1 } },
    ledger: [
      { text: 'Qamal zarari +25%', points: 10 },
      { text: "Diplomatik ishonch o'sishi +25%", points: 10 },
      { text: 'Piyoda hujumi +10%', points: 10 },
      { text: 'Oltin daromadi +10%', points: 10 },
      { text: 'Armiya oltin maoshi +10%', points: -5 },
      { text: 'Otliq mudofaasi -10%', points: -5 },
    ],
  },
  temuriy: {
    key: 'temuriy', name: 'Temuriy turklar',
    bonuses: { ...base(), researchSpeed: 0.2, unitAttack: { otliq: 0.1, ogir_otliq: 0.1 }, buildTime: -0.1,
      weatherImmune: ['jazirama'], terrainAdapted: ['chol'], wallHp: -0.1, production: { iron: -0.1 } },
    ledger: [
      { text: 'Tadqiqot tezligi +20%', points: 10 },
      { text: 'Otliq va og\'ir otliq hujumi +10%', points: 10 },
      { text: 'Qurilish 10% tezroq', points: 10 },
      { text: "Cho'lga moslashgan, jazirama jarimasi yo'q", points: 10 },
      { text: 'Devor HP -10%', points: -5 },
      { text: 'Temir ishlab chiqarish -10%', points: -5 },
    ],
  },
  mogul: {
    key: 'mogul', name: "Mo'g'ullar",
    bonuses: { ...base(), marchSpeed: 0.2, unitAttack: { otliq: 0.15 }, production: { horses: 0.3 },
      weatherImmune: ['qor'], terrainAdapted: ['chol', 'tekislik'], wallHp: -0.1, popGrowth: -0.1 },
    ledger: [
      { text: 'Yurish tezligi +20%', points: 10 },
      { text: 'Otliq hujumi +15%', points: 10 },
      { text: 'Ot ishlab chiqarish +30%', points: 10 },
      { text: "Cho'l va tekislikka moslashgan, qor jarimasi yo'q", points: 10 },
      { text: 'Devor HP -10%', points: -5 },
      { text: "Aholi o'sishi -10%", points: -5 },
    ],
  },
};

export const ledgerTotal = (c: Culture): number => CULTURES[c].ledger.reduce((s, l) => s + l.points, 0);
