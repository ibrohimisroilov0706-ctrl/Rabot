// apps/client/src/lord/data.ts
// Lord rejimi ma'lumotlari: fraksiyalar, qo'shin daraxtlari (har millatda 9-10 tur), nomlar.
// DOM yo'q: node testlarida ham ishlaydi.

import type { Culture } from '@qirolliklar/game-rules';

export type FacId = Culture | 'player' | 'bandit';
export type Cls = 'inf' | 'spear' | 'arch' | 'cav' | 'harch' | 'eleph';
export type Group = 'inf' | 'arch' | 'cav';
export const groupOf = (c: Cls): Group => (c === 'arch' ? 'arch' : c === 'cav' || c === 'harch' || c === 'eleph' ? 'cav' : 'inf');

export interface TroopDef {
  id: string; name: string; cu: Culture; art: string; cls: Cls; tier: number;
  hp: number; atk: number; def: number; spd: number; range: number;
  up: string[]; wage: number; // haftalik maosh
}

export const CULTURE_LIST: Culture[] = ['temuriy', 'rus', 'ingliz', 'usmonli', 'mogul'];

export const FACTIONS: Record<FacId, { name: string; short: string; color: string }> = {
  rus: { name: 'Rus knyazligi', short: 'Ruslar', color: '#c0392b' },
  ingliz: { name: 'Angliya qirolligi', short: 'Inglizlar', color: '#d8d8e0' },
  usmonli: { name: 'Usmonli saltanati', short: 'Usmonlilar', color: '#27ae60' },
  temuriy: { name: 'Temuriylar davlati', short: 'Temuriylar', color: '#2e6fd8' },
  mogul: { name: "Mo'g'ul xonligi", short: "Mo'g'ullar", color: '#e67e22' },
  player: { name: 'Sizning davlatingiz', short: 'Siz', color: '#f0c040' },
  bandit: { name: 'Qaroqchilar', short: 'Qaroqchilar', color: '#3a3a3a' },
};

const NAMES: Record<Culture, { inf3: [string, string]; arc3: [string, string]; cav3: string; cav4: [string, string]; t1: string; inf2: string; arc2: string; spr3: string }> = {
  temuriy: { t1: 'Navkar', inf2: 'Sarboz', arc2: 'Kamonchi', spr3: 'Nayzachi', inf3: ['Qorovul sarboz', 'piyoda'], arc3: ['Mergan', 'kamonchi'], cav3: 'Otliq', cav4: ['Bahodir', 'bahodir'] },
  rus: { t1: 'Mujik', inf2: 'Ratnik', arc2: 'Kamonchi', spr3: 'Nayzachi', inf3: ['Drujinachi', 'drujina'], arc3: ["O'rmon ovchisi", 'ovchi'], cav3: 'Otliq', cav4: ['Boyar otliq', 'ogir_otliq'] },
  ingliz: { t1: 'Dehqon', inf2: 'Piyoda', arc2: 'Kamonchi', spr3: 'Nayzachi', inf3: ['Zirhli piyoda', 'piyoda'], arc3: ['Uzun kamonchi', 'uzun_kamonchi'], cav3: 'Otliq', cav4: ['Ritsar', 'ritsar'] },
  usmonli: { t1: 'Azab', inf2: 'Piyoda', arc2: 'Kamonchi', spr3: 'Nayzachi', inf3: ['Yangicheri', 'yangicheri'], arc3: ['Mohir kamonchi', 'kamonchi'], cav3: 'Otliq', cav4: ['Sipohiy', 'ogir_otliq'] },
  mogul: { t1: 'Cho\'pon', inf2: 'Jangchi', arc2: 'Kamonchi', spr3: 'Nayzachi', inf3: ['Tarxon', 'piyoda'], arc3: ['Mergan', 'kamonchi'], cav3: 'Otliq kamonchi', cav4: ["Mang'ut", 'manggut'] },
};

/** Millat bonuslari (jangda): kichik, lekin seziladigan */
const BONUS: Record<Culture, Partial<Record<Cls, { atk?: number; def?: number; hp?: number; spd?: number }>>> = {
  temuriy: { cav: { atk: 2, def: 2 }, inf: { def: 2 } },
  rus: { inf: { def: 4, hp: 10 }, spear: { def: 3 } },
  ingliz: { arch: { atk: 2, }, cav: { atk: 3 } },
  usmonli: { inf: { atk: 2, def: 2 }, arch: { atk: 1 } },
  mogul: { harch: { atk: 1, spd: 10 }, cav: { spd: 10 } },
};

function mk(cu: Culture, id: string, name: string, art: string, cls: Cls, tier: number, hp: number, atk: number, def: number, spd: number, range: number, up: string[], wage: number): TroopDef {
  const b = BONUS[cu][cls] ?? {};
  return { id: `${cu}_${id}`, name, cu, art, cls, tier, hp: hp + (b.hp ?? 0), atk: atk + (b.atk ?? 0), def: def + (b.def ?? 0), spd: spd + (b.spd ?? 0), range, up: up.map(u => `${cu}_${u}`), wage };
}

function treeFor(cu: Culture): TroopDef[] {
  const n = NAMES[cu]; const mog = cu === 'mogul';
  const list: TroopDef[] = [
    mk(cu, 't1', n.t1, 'piyoda', 'inf', 1, 55, 7, 4, 40, 0, ['inf2', 'arc2'], 2),
    mk(cu, 'inf2', n.inf2, 'piyoda', 'inf', 2, 75, 10, 14, 40, 0, ['inf3', 'spr3', 'cav3'], 4),
    mk(cu, 'arc2', n.arc2, 'kamonchi', 'arch', 2, 60, 9, 8, 42, 240, ['arc3'], 5),
    mk(cu, 'spr3', n.spr3, 'nayzachi', 'spear', 3, 90, 11, 22, 38, 0, [], 7),
    mk(cu, 'inf3', n.inf3[0], n.inf3[1], 'inf', 3, 105, 15, 27, 40, 0, [], 9),
    mk(cu, 'arc3', n.arc3[0], n.arc3[1], 'arch', 3, 70, 13, 12, 42, 290, [], 9),
    mog ? mk(cu, 'cav3', n.cav3, 'otliq', 'harch', 3, 85, 10, 14, 92, 210, ['cav4'], 11)
        : mk(cu, 'cav3', n.cav3, 'otliq', 'cav', 3, 95, 14, 18, 92, 0, ['cav4'], 11),
    mog ? mk(cu, 'cav4', n.cav4[0], n.cav4[1], 'harch', 4, 115, 13, 24, 96, 240, [], 18)
        : mk(cu, 'cav4', n.cav4[0], n.cav4[1], 'cav', 4, 135, 20, 32, 88, 0, cu === 'temuriy' ? ['elf5'] : [], 18),
  ];
  if (cu === 'temuriy') list.push(mk(cu, 'elf5', 'Jangovar fil', 'jangovar_fil', 'eleph', 5, 420, 28, 34, 46, 0, [], 40));
  return list;
}

export const TROOPS: Record<string, TroopDef> = Object.fromEntries(CULTURE_LIST.flatMap(treeFor).map(t => [t.id, t]));
export const troop = (id: string): TroopDef => {
  const t = TROOPS[id]; if (!t) throw new Error(`Noma'lum askar: ${id}`); return t;
};

export const RECRUIT_COST = 12;            // qishloqda 1-darajali askar narxi
export const upgradeCost = (tier: number) => [0, 20, 60, 150, 320, 600][tier] ?? 600;
export const xpNeed = (tier: number) => [0, 40, 110, 240, 450, 900][tier] ?? 900;
export const ransom = (tier: number) => 6 + tier * tier * 8;
export const mercCost = (tier: number) => upgradeCost(tier) * 2 + 60;

/** Askarning taxminiy kuchi (avto-hisob va AI qarorlari uchun) */
export function troopPower(id: string): number {
  const t = troop(id);
  const rangedK = t.range > 0 ? 1.25 : 1;
  const cavK = t.cls === 'cav' || t.cls === 'harch' ? 1.2 : 1;
  return (t.hp / 60) * (t.atk / 8) * (1 + t.def / 40) * rangedK * cavK;
}

export const LORD_NAMES: Record<Culture, string[]> = {
  temuriy: ['Jahongir', 'Bahrom', 'Sanjar', 'Xusrav', 'Iskandar', 'Davlatbek', 'Oybek', 'Shohmalik'],
  rus: ['Yaroslav', 'Mstislav', 'Vsevolod', 'Svyatoslav', 'Izyaslav', 'Rostislav', 'Boris', 'Gleb'],
  ingliz: ['Edvard', 'Genri', 'Richard', 'Uilyam', 'Jon', 'Robert', 'Tomas', 'Jefri'],
  usmonli: ['Murod', 'Orxon', 'Mehmed', 'Salim', 'Ahmad', 'Kemal', 'Yusuf', 'Hasan'],
  mogul: ['Batbayar', 'Ganbold', 'Tumur', 'Erdene', 'Jargal', 'Arslon', 'Mengli', 'Esen'],
};
export const LORD_TITLE: Record<Culture, string> = { temuriy: 'Amir', rus: 'Knyaz', ingliz: 'Ser', usmonli: 'Posho', mogul: "No'yon" };
export const KING_TITLE: Record<Culture, string> = { temuriy: 'Sulton', rus: 'Buyuk knyaz', ingliz: 'Qirol', usmonli: 'Sulton', mogul: 'Xon' };

export const SET_NAMES: Record<Culture, { town: string[]; castle: string[]; village: string[] }> = {
  temuriy: { town: ["Ko'kshahar", 'Oltinsoy', 'Zarafshon'], castle: ["Oqqo'rg'on", 'Temirdarvoza', "Ko'ksaroy"],
    village: ["Bog'ishamol", "Qorabog'", 'Yangiariq', 'Chordara', 'Tolzor', "Uchqo'rg'on", 'Shirinsoy', 'Qumqishloq', 'Olmazor', 'Gulbahor', 'Navbahor', 'Chinor'] },
  rus: { town: ['Belograd', 'Zarechye', 'Kitej'], castle: ['Gorodets', 'Ostrog', 'Vishgorod'],
    village: ['Berezovka', 'Lipki', 'Sosnovka', 'Ozerki', 'Dubki', 'Kamenka', 'Ryabinovka', 'Medvedki', 'Yasenevo', 'Polyana', 'Rechitsa', 'Jurba'] },
  ingliz: { town: ['Ashford', 'Kingsbrij', 'Vestmor'], castle: ['Redklif', 'Stounhold', 'Reyvenhurst'],
    village: ['Millbruk', 'Oukem', 'Fernli', 'Xollou', 'Eshbi', 'Brukfild', 'Elmsted', 'Uitbi', 'Torntun', 'Marsh', 'Danmor', 'Kresbi'] },
  usmonli: { town: ['Yangishahar', 'Qorasu', 'Oqhisor'], castle: ["Qizilqal'a", "Toshqo'rg'on", 'Burgaz'],
    village: ["Ko'kova", 'Yayla', "Bog'cha", 'Chashma', 'Qoraqir', 'Sariyer', 'Tepa', 'Dere', 'Yemish', 'Gulova', 'Ilija', 'Kozlu'] },
  mogul: { town: ["Ulug'o'rda", "Ko'ko'rda", 'Oltinbuloq'], castle: ['Temirqopqa', "Qorag'or", 'Burqut'],
    village: ['Ovul', 'Yaylov', 'Qishlov', 'Bayan', 'Tal', 'Erdene', 'Moron', 'Xatgal', 'Zuun', 'Baruun', 'Dalan', "Tsag'on"] },
};

export const BANDIT_KINDS: { name: string; troops: (cu: Culture) => [string, number][] }[] = [
  { name: "Qaroqchilar to'dasi", troops: cu => [[`${cu}_t1`, 10], [`${cu}_inf2`, 3]] },
  { name: "O'rmon qaroqchilari", troops: cu => [[`${cu}_arc2`, 6], [`${cu}_t1`, 6]] },
  { name: "Cho'l bosqinchilari", troops: () => [['mogul_cav3', 7], ['mogul_t1', 4]] },
  { name: 'Qochoq askarlar', troops: cu => [[`${cu}_inf2`, 7], [`${cu}_spr3`, 3], [`${cu}_arc2`, 3]] },
];
