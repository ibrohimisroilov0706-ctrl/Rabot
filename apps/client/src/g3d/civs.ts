// apps/client/src/g3d/civs.ts
// Oltita sivilizatsiya: tashqi ko'rinish (kiyim, dubulg'a, qalqon, bayroq) va jangdagi ustunliklar.
// Hammasi original: tarixiy uslubdan ilhomlangan oddiy geometrik shakllar va ranglar.

export type CivKey = 'timurid' | 'mughal' | 'chinese' | 'ottoman' | 'english' | 'russian';
export type Helmet = 'turbanSpike' | 'turban' | 'chinese' | 'bork' | 'kettle' | 'spire';
export type ShieldKind = 'round' | 'rect' | 'kite';

export interface Civ {
  key: CivKey; name: string; region: string; desc: string; advantages: string[];
  look: { skin: string; tunic: string; trim: string; pants: string; boots: string; metal: string; cloth: string; shield: string; shieldTrim: string; helmet: Helmet; shieldKind: ShieldKind; skirt: boolean };
  flag: { bg: string; fg: string; emblem: 'rings' | 'sun' | 'border' | 'crescent' | 'cross' | 'star' };
  mods: { speed: number; hp: number; stamRegen: number; dmg: number; blockCost: number; armor: number };
  /** 2D lord xaritasidagi madaniyat kaliti (agar mavjud bo'lsa) */
  lordCulture?: 'temuriy' | 'usmonli' | 'ingliz' | 'rus';
}

const M = (m: Partial<Civ['mods']>): Civ['mods'] => ({ speed: 1, hp: 1, stamRegen: 1, dmg: 1, blockCost: 1, armor: 0, ...m });

export const CIVS: Record<CivKey, Civ> = {
  timurid: {
    key: 'timurid', name: 'Temuriylar davlati', region: 'Markaziy Osiyo',
    desc: "Samarqand va Movarounnahr hukmdorlari. Tezkor otliqlar, mohir kamonchilar va qilichbozlar; lojuvard gumbazlar va naqshinkor peshtoqlar yurti.",
    advantages: ['Harakat tezligi +12%', 'Otliq hujumi kuchli (2-bosqichda)', 'Chidamlilik tez tiklanadi +10%'],
    look: { skin: '#c99a72', tunic: '#1e3f8c', trim: '#d4a537', pants: '#5b4630', boots: '#3a2a1a', metal: '#b8c0c8', cloth: '#f4efe3', shield: '#1f8a9e', shieldTrim: '#d4a537', helmet: 'turbanSpike', shieldKind: 'round', skirt: true },
    flag: { bg: '#1e3f8c', fg: '#d4a537', emblem: 'rings' },
    mods: M({ speed: 1.12, stamRegen: 1.1 }), lordCulture: 'temuriy',
  },
  mughal: {
    key: 'mughal', name: 'Boburiylar (Mug\'al) imperiyasi', region: 'Hindiston',
    desc: "Hindistondagi qudratli saltanat. Zirhli otliqlar, piyodalar, kamonchilar va jangovar fillar; oq marmar saroylar va qizil qal'alar.",
    advantages: ['Sog\'liq +15%', 'Jangovar fillar (2-bosqichda)', 'Boy xazina: soliq +10% (3-bosqichda)'],
    look: { skin: '#b88160', tunic: '#f3ead6', trim: '#2e8b57', pants: '#b03a2e', boots: '#5a3a1e', metal: '#c8b070', cloth: '#e8a33d', shield: '#3b2a1a', shieldTrim: '#d4a537', helmet: 'turban', shieldKind: 'round', skirt: true },
    flag: { bg: '#2e7d32', fg: '#f2c94c', emblem: 'sun' },
    mods: M({ hp: 1.15 }),
  },
  chinese: {
    key: 'chinese', name: 'Xitoy imperiyasi', region: 'Sharqiy Osiyo',
    desc: "Buyuk devor ortidagi qadimiy imperiya. Arbaletchilar, nayzachilar va intizomli piyodalar; ko'p qavatli pagodalar va mustahkam qal'alar.",
    advantages: ['Chidamlilik tiklanishi +25%', 'Arbaletchilar (2-bosqichda)', 'Intizom: qalqon bilan to\'sish arzonroq -10%'],
    look: { skin: '#e0b48a', tunic: '#8e1b1b', trim: '#d4a537', pants: '#2b2b2b', boots: '#1f1f1f', metal: '#5d6066', cloth: '#c8102e', shield: '#a61b1b', shieldTrim: '#d4a537', helmet: 'chinese', shieldKind: 'rect', skirt: true },
    flag: { bg: '#d8b02a', fg: '#a61b1b', emblem: 'border' },
    mods: M({ stamRegen: 1.25, blockCost: 0.9 }),
  },
  ottoman: {
    key: 'ottoman', name: 'Usmonli saltanati', region: 'Anado\'li va Yaqin Sharq',
    desc: "Uch qit'aga yoyilgan saltanat. Yangicherilar, sipohiy otliqlari, kamonchilar va to'plar; gumbazli masjidlar va minorali qal'alar.",
    advantages: ['Zarba kuchi +12%', 'To\'p va qamal qurollari (2-bosqichda)', 'Yangicherilar intizomi'],
    look: { skin: '#d6a27a', tunic: '#b3202a', trim: '#d4a537', pants: '#1f3c88', boots: '#a0782a', metal: '#b8bec6', cloth: '#f4f1ea', shield: '#b8bec6', shieldTrim: '#b3202a', helmet: 'bork', shieldKind: 'round', skirt: true },
    flag: { bg: '#b3202a', fg: '#f4f1ea', emblem: 'crescent' },
    mods: M({ dmg: 1.12 }), lordCulture: 'usmonli',
  },
  english: {
    key: 'english', name: 'Angliya qirolligi', region: 'Britaniya orollari',
    desc: "Tumanli orollar qirolligi. Uzun kamonchilar, og'ir zirhli ritsarlar va qilichbozlar; tosh qal'alar va o'rmon qishloqlari.",
    advantages: ['Qalqon bilan to\'sish -20% chidamlilik', 'Uzun kamonchilar (2-bosqichda)', 'Ritsarlar zarbasi'],
    look: { skin: '#e8c0a0', tunic: '#f1ece2', trim: '#b22234', pants: '#8a9099', boots: '#2a1d12', metal: '#b9c0c8', cloth: '#b22234', shield: '#f1ece2', shieldTrim: '#b22234', helmet: 'kettle', shieldKind: 'kite', skirt: false },
    flag: { bg: '#f1ece2', fg: '#b22234', emblem: 'cross' },
    mods: M({ blockCost: 0.8 }), lordCulture: 'ingliz',
  },
  russian: {
    key: 'russian', name: 'Rus knyazliklari', region: 'Sharqiy Yevropa',
    desc: "O'rmonlar va daryolar o'lkasi. Zirhli drujina otliqlari, kamonchilar va nayzachilar; yog'och va tosh kremllar, piyozsimon gumbazlar.",
    advantages: ['Zirh: zarar -12%', 'Sovuqqa chidamli', 'Drujina otliqlari (2-bosqichda)'],
    look: { skin: '#e3b48c', tunic: '#9e2a2b', trim: '#c9a227', pants: '#3b3b5c', boots: '#6b2a1a', metal: '#a7b0ba', cloth: '#9e2a2b', shield: '#b3312f', shieldTrim: '#e8c35a', helmet: 'spire', shieldKind: 'kite', skirt: false },
    flag: { bg: '#9e2a2b', fg: '#e8c35a', emblem: 'star' },
    mods: M({ armor: 0.12 }), lordCulture: 'rus',
  },
};
export const CIV_LIST: CivKey[] = ['timurid', 'mughal', 'chinese', 'ottoman', 'english', 'russian'];
