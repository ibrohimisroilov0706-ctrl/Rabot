// apps/client/src/i18n.ts
// O'zbekcha matnlar. Bino nomlari millatga qarab farqlanadi (03 Millatlar tabi).

import type { BuildingKey, Culture, ResourceKey } from '@qirolliklar/game-rules';

export const RES: Record<ResourceKey, { name: string; icon: string }> = {
  gold: { name: 'Oltin', icon: '🪙' }, food: { name: 'Oziq', icon: '🌾' }, wood: { name: 'Yog‘och', icon: '🪵' },
  stone: { name: 'Tosh', icon: '🪨' }, iron: { name: 'Temir', icon: '⛓️' }, horses: { name: 'Otlar', icon: '🐎' },
};

export const CULTURE_NAME: Record<Culture, string> = {
  rus: 'Ruslar', ingliz: 'Inglizlar', usmonli: 'Usmonli turklar', temuriy: 'Temuriy turklar', mogul: 'Mo‘g‘ullar',
};
export const CULTURE_COLOR: Record<Culture, string> = {
  rus: '#9E2A2B', ingliz: '#B22234', usmonli: '#1E6B52', temuriy: '#1F8A9E', mogul: '#3A7BD5',
};
export const CULTURE_BLURB: Record<Culture, string> = {
  rus: 'Shimoliy o‘rmonlar. Kuchli devorlar va mudofaa, ko‘p yog‘och.',
  ingliz: 'Tosh qal’alar va savdo yo‘llari. Uzun kamonchilar.',
  usmonli: 'Gumbazlar va diplomatiya. Yangicherilar va qamal to‘plari.',
  temuriy: 'Samarqand va Buxoro. Ilm-fan, me’morchilik, otliq zarba.',
  mogul: 'Dasht va Xitoy chegarasi. Tezlik, otliq kamonchilar.',
};

const B: Record<BuildingKey, string> = {
  saroy: 'Saroy', ferma: 'Ferma', yogoch: 'Yog‘och tilish', tosh_kon: 'Tosh koni', temir_kon: 'Temir koni', otxona: 'Otxona',
  ombor: 'Ombor', mahalla: 'Mahalla', kazarma: 'Kazarma', temirchilik: 'Temirchilik', ustaxona: 'Ustaxona', devor: 'Devor',
  minora: 'Minora', bozor: 'Bozor', karvonsaroy: 'Karvonsaroy', ibodatxona: 'Ibodatxona', akademiya: 'Akademiya',
  elchixona: 'Elchixona', qamoqxona: 'Zindon',
};
const TEMPLE: Record<Culture, string> = { rus: 'Cherkov', ingliz: 'Sobor', usmonli: 'Masjid', temuriy: 'Masjid', mogul: 'Ma’bad' };
const ACADEMY: Record<Culture, string> = { rus: 'Kutubxona', ingliz: 'Kollej', usmonli: 'Madrasa', temuriy: 'Madrasa', mogul: 'Akademiya' };

export function buildingName(k: BuildingKey, c: Culture): string {
  if (k === 'ibodatxona') return TEMPLE[c];
  if (k === 'akademiya') return ACADEMY[c];
  if (k === 'karvonsaroy' && c === 'ingliz') return 'Savdo uyi';
  return B[k];
}

export const BUILDING_INFO: Record<BuildingKey, string> = {
  saroy: 'Shahar darajasi. Boshqa binolar saroydan baland bo‘lmaydi. Har daraja qurilishni 3% tezlashtiradi.',
  ferma: 'Oziq ishlab chiqaradi. Aholi va qo‘shin oziqsiz qolsa, kuch va aholi kamayadi.',
  yogoch: 'Yog‘och ishlab chiqaradi.', tosh_kon: 'Tosh ishlab chiqaradi.', temir_kon: 'Temir ishlab chiqaradi.',
  otxona: 'Otlar va otliq qo‘shin.', ombor: 'Resurslar sig‘imi. To‘lgan ombordan ortiqchasi yo‘qoladi.',
  mahalla: 'Aholi sig‘imi. Aholi ishchi va soliq beradi.', kazarma: 'Piyoda, kamonchi, nayzachi yollash.',
  temirchilik: 'Barcha qo‘shin hujumi va mudofaasi +1%/daraja.', ustaxona: 'Qamal qurollari.',
  devor: 'Himoyachi kuchi +8%/daraja. Qamal qurollari devorni buzadi.', minora: 'Shahar mudofaasiga +60 kuch/daraja.',
  bozor: 'Savdo va karvonlar, baxt +1.', karvonsaroy: 'Bir vaqtdagi karvonlar soni.', ibodatxona: 'Baxt +2/daraja.',
  akademiya: 'Tadqiqot (2-bosqichda).', elchixona: 'Agentlar va diplomatiya.', qamoqxona: 'Asirlar va suiqasdga qarshi himoya.',
};

export const UNIT_ICON: Record<string, string> = {
  piyoda: '🛡️', kamonchi: '🏹', nayzachi: '🔱', otliq: '🐎', ogir_otliq: '🏇', qamal: '🪨',
  drujina: '🛡️', ovchi: '🏹', uzun_kamonchi: '🏹', ritsar: '🏇', yangicheri: '⚔️', shohi_top: '💣',
  bahodir: '🏇', jangovar_fil: '🐘', manggut: '🐎', xitoy_manjaniq: '🪨',
};

export const STATUS_NAME: Record<string, string> = { yollanma: 'Yollanma', ittifoqchi: 'Mustaqil ittifoqchi', vassal: 'Vassal' };
export const TREATY_NAME: Record<string, string> = { ittifoq: 'Ittifoq', savdo: 'Savdo', tinchlik: 'Tinchlik', urush: 'Urush', nikoh: 'Nikoh' };
export const TIER_NAME: Record<string, string> = { qishloq: 'Qishloq', kichik_shahar: 'Kichik shahar', rivojlangan_shahar: 'Rivojlangan shahar', katta_shahar: 'Katta shahar', poytaxt: 'Poytaxt' };
export const TERRAIN_NAME: Record<string, string> = { tekislik: 'Tekislik', ormon: 'O‘rmon', tog: 'Tog‘', chol: 'Cho‘l', daryo: 'Daryo' };
export const WEATHER_NAME: Record<string, string> = { ochiq: 'Ochiq', yomgir: 'Yomg‘ir', qor: 'Qor', jazirama: 'Jazirama', tuman: 'Tuman' };

export const ERR: Record<string, string> = {
  unauthorized: 'Sessiya tugadi, qayta kiring', rate_limited: 'Biroz sekinroq', internal: 'Server xatosi, keyinroq urinib ko‘ring',
};
