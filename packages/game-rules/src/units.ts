// packages/game-rules/src/units.ts
// Birliklar: 6 ta asosiy sinf + har millatda 2 ta maxsus birlik.
// Maxsus birliklar qoidasi: kuchi asosiy sinfdan ~x1.3, narxi ham ~x1.3 -> resurs samaradorligi teng,
// lekin aholi/ovqat samaradorligi yuqori (elita). Shu sabab hech biri "majburiy eng yaxshi" emas.

import type { Culture, Resources, UnitClass } from './types.js';

export interface UnitDef {
  key: string;
  name: string;
  cls: UnitClass;
  culture?: Culture; // undefined = barcha millatlarda bor
  attack: number;
  defense: number;
  siege: number; // devorga soatiga zarar
  speed: number; // katak/soat
  carry: number; // o'lja ko'tarish
  foodPerHour: number;
  goldPerHour: number;
  cost: Partial<Resources>;
  trainSec: number;
  special?: string;
}

const U = (u: UnitDef): UnitDef => u;

export const BASE_UNITS: Record<UnitClass, UnitDef> = {
  piyoda: U({ key: 'piyoda', name: 'Piyoda', cls: 'piyoda', attack: 10, defense: 12, siege: 0, speed: 4, carry: 20, foodPerHour: 0.5, goldPerHour: 0.3, cost: { gold: 40, food: 30, wood: 10, iron: 10 }, trainSec: 60 }),
  kamonchi: U({ key: 'kamonchi', name: 'Kamonchi', cls: 'kamonchi', attack: 12, defense: 6, siege: 0, speed: 4, carry: 15, foodPerHour: 0.5, goldPerHour: 0.4, cost: { gold: 50, food: 30, wood: 30, iron: 5 }, trainSec: 75 }),
  nayzachi: U({ key: 'nayzachi', name: 'Nayzachi', cls: 'nayzachi', attack: 8, defense: 14, siege: 0, speed: 4, carry: 20, foodPerHour: 0.5, goldPerHour: 0.3, cost: { gold: 40, food: 30, wood: 25, iron: 10 }, trainSec: 70 }),
  otliq: U({ key: 'otliq', name: 'Otliq', cls: 'otliq', attack: 16, defense: 8, siege: 0, speed: 8, carry: 60, foodPerHour: 1.0, goldPerHour: 0.8, cost: { gold: 90, food: 50, wood: 10, iron: 20, horses: 1 }, trainSec: 120 }),
  ogir_otliq: U({ key: 'ogir_otliq', name: "Og'ir otliq", cls: 'ogir_otliq', attack: 24, defense: 14, siege: 0, speed: 6, carry: 40, foodPerHour: 1.5, goldPerHour: 1.4, cost: { gold: 160, food: 80, wood: 10, iron: 50, horses: 1 }, trainSec: 200 }),
  qamal: U({ key: 'qamal', name: 'Qamal quroli', cls: 'qamal', attack: 4, defense: 4, siege: 40, speed: 2, carry: 0, foodPerHour: 1.0, goldPerHour: 1.0, cost: { gold: 200, food: 50, wood: 150, iron: 60 }, trainSec: 400 }),
};

export const SPECIAL_UNITS: UnitDef[] = [
  U({ key: 'drujina', name: 'Drujina', cls: 'piyoda', culture: 'rus', attack: 13, defense: 17, siege: 0, speed: 4, carry: 25, foodPerHour: 0.6, goldPerHour: 0.4, cost: { gold: 55, food: 35, wood: 10, iron: 18 }, trainSec: 90, special: "Mudofaada o'rmon va devor ortida qo'shimcha +10% mudofaa" }),
  U({ key: 'ovchi', name: "O'rmon ovchisi", cls: 'kamonchi', culture: 'rus', attack: 15, defense: 8, siege: 0, speed: 5, carry: 15, foodPerHour: 0.5, goldPerHour: 0.5, cost: { gold: 65, food: 35, wood: 40, iron: 6 }, trainSec: 95, special: "O'rmonda hujum +20%" }),
  U({ key: 'uzun_kamonchi', name: 'Uzun kamonchi', cls: 'kamonchi', culture: 'ingliz', attack: 16, defense: 7, siege: 0, speed: 4, carry: 15, foodPerHour: 0.5, goldPerHour: 0.5, cost: { gold: 65, food: 35, wood: 40, iron: 6 }, trainSec: 95, special: "Mudofaa jangida birinchi raund otishmasi: dushman otliq hujumi -10%" }),
  U({ key: 'ritsar', name: 'Ritsar', cls: 'ogir_otliq', culture: 'ingliz', attack: 31, defense: 18, siege: 0, speed: 6, carry: 40, foodPerHour: 1.6, goldPerHour: 1.8, cost: { gold: 210, food: 90, wood: 10, iron: 65, horses: 1 }, trainSec: 260, special: 'Tekislikda hujum +10%' }),
  U({ key: 'yangicheri', name: 'Yangicheri', cls: 'piyoda', culture: 'usmonli', attack: 14, defense: 15, siege: 0, speed: 4, carry: 20, foodPerHour: 0.6, goldPerHour: 0.5, cost: { gold: 60, food: 35, wood: 10, iron: 16 }, trainSec: 90, special: 'Xizmat shartnomasida sadoqat +10' }),
  U({ key: 'shohi_top', name: "Shohi to'p", cls: 'qamal', culture: 'usmonli', attack: 6, defense: 4, siege: 55, speed: 1.5, carry: 0, foodPerHour: 1.2, goldPerHour: 1.3, cost: { gold: 270, food: 60, wood: 120, iron: 120 }, trainSec: 520, special: 'Shahar hujumida minora darajasi 1 ga past hisoblanadi' }),
  U({ key: 'bahodir', name: 'Bahodir', cls: 'ogir_otliq', culture: 'temuriy', attack: 31, defense: 18, siege: 0, speed: 7, carry: 40, foodPerHour: 1.6, goldPerHour: 1.8, cost: { gold: 210, food: 90, wood: 10, iron: 65, horses: 1 }, trainSec: 260, special: "General bilan jangda general mahorati +5" }),
  U({ key: 'jangovar_fil', name: 'Jangovar fil', cls: 'ogir_otliq', culture: 'temuriy', attack: 34, defense: 22, siege: 15, speed: 3, carry: 80, foodPerHour: 4, goldPerHour: 2.2, cost: { gold: 300, food: 200, wood: 20, iron: 40 }, trainSec: 420, special: "Dushman otliqlari hujumi -10%; o'rmonda hujum -30%" }),
  U({ key: 'manggut', name: "Mang'ut otliq kamonchi", cls: 'otliq', culture: 'mogul', attack: 20, defense: 10, siege: 0, speed: 9, carry: 50, foodPerHour: 1.1, goldPerHour: 1.0, cost: { gold: 115, food: 65, wood: 15, iron: 22, horses: 1 }, trainSec: 150, special: 'Nayzachilarning otliqqa qarshi bonusi yarmiga tushadi' }),
  U({ key: 'xitoy_manjaniq', name: 'Xitoy manjaniqi', cls: 'qamal', culture: 'mogul', attack: 5, defense: 5, siege: 55, speed: 2, carry: 0, foodPerHour: 1.2, goldPerHour: 1.3, cost: { gold: 270, food: 60, wood: 200, iron: 70 }, trainSec: 520, special: "Dala istehkomi 'Arava qo'rg'oni' quradi: dalada mudofaa +15%" }),
];

export function unitDef(key: string): UnitDef {
  const d = (BASE_UNITS as Record<string, UnitDef>)[key] ?? SPECIAL_UNITS.find(u => u.key === key);
  if (!d) throw new Error(`Noma'lum birlik: ${key}`);
  return d;
}

/** Qarshi turish matritsasi M[hujumchi][himoyachi]; ko'rsatilmagan = 1.0 */
export const COUNTER: Partial<Record<UnitClass, Partial<Record<UnitClass, number>>>> = {
  nayzachi: { otliq: 1.5, ogir_otliq: 1.5 },
  otliq: { kamonchi: 1.5, qamal: 1.5 },
  ogir_otliq: { kamonchi: 1.3, piyoda: 1.2, qamal: 1.5 },
  kamonchi: { piyoda: 1.25, nayzachi: 1.25 },
  piyoda: { nayzachi: 1.2, qamal: 1.5 },
};
