// packages/game-rules/src/rng.ts
// Deterministik tasodif: bir xil seed -> bir xil natija (replay, audit va anti-cheat uchun).

/** FNV-1a 32-bit hash: matnli seed'ni sonli seed'ga aylantiradi. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: [0, 1) oralig'ida tekis taqsimlangan son qaytaradi. */
export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
