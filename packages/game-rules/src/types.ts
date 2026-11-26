// packages/game-rules/src/types.ts
// Barcha modullar uchun umumiy turlar. DB enum'lari bilan bir xil nomlar ishlatiladi.

export type Culture = 'rus' | 'ingliz' | 'usmonli' | 'temuriy' | 'mogul';

export type ResourceKey = 'gold' | 'food' | 'wood' | 'stone' | 'iron' | 'horses';
export type Resources = Record<ResourceKey, number>;

export const RESOURCE_KEYS: readonly ResourceKey[] = ['gold', 'food', 'wood', 'stone', 'iron', 'horses'];

export const emptyResources = (): Resources => ({ gold: 0, food: 0, wood: 0, stone: 0, iron: 0, horses: 0 });

export type UnitClass = 'piyoda' | 'kamonchi' | 'nayzachi' | 'otliq' | 'ogir_otliq' | 'qamal';

export type Terrain = 'tekislik' | 'ormon' | 'tog' | 'chol' | 'daryo';
export type Weather = 'ochiq' | 'yomgir' | 'qor' | 'jazirama' | 'tuman';

export type ServiceStatus = 'ittifoqchi' | 'vassal' | 'yollanma';
