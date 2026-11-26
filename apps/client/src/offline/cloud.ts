// apps/client/src/offline/cloud.ts
// Oflayn saqlanmani Telegram CloudStorage'ga zaxiralash (har foydalanuvchi uchun bepul, 1024 kalit x 4096 belgi).
// Telefon almashtirilsa yoki Telegram qayta o'rnatilsa ham progress qaytadi.

type CS = {
  setItem(k: string, v: string, cb?: (e: unknown, ok?: boolean) => void): void;
  getItem(k: string, cb: (e: unknown, v?: string) => void): void;
  getItems(k: string[], cb: (e: unknown, v?: Record<string, string>) => void): void;
};
const cs = (): CS | null => (window as unknown as { Telegram?: { WebApp?: { CloudStorage?: CS; initData?: string } } }).Telegram?.WebApp?.initData
  ? (window as any).Telegram.WebApp.CloudStorage ?? null : null;
const CHUNK = 4000;

export async function cloudLoad(): Promise<string | null> {
  const c = cs(); if (!c) return null;
  const n = await new Promise<number>(res => c.getItem('qrl_n', (e, v) => res(e ? 0 : Number(v) || 0)));
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => `qrl_${i}`);
  const vals = await new Promise<Record<string, string> | null>(res => c.getItems(keys, (e, v) => res(e ? null : v ?? null)));
  if (!vals) return null;
  const s = keys.map(k => vals[k] ?? '').join('');
  try { JSON.parse(s); return s; } catch { return null; }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending = '';
/** Tez-tez chaqirilsa ham 15 soniyada bir marta yozadi */
export function cloudSave(json: string) {
  const c = cs(); if (!c) return;
  pending = json;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const s = pending; const n = Math.ceil(s.length / CHUNK);
    if (n > 900) return;
    for (let i = 0; i < n; i++) c.setItem(`qrl_${i}`, s.slice(i * CHUNK, (i + 1) * CHUNK));
    c.setItem('qrl_n', String(n));
  }, 15_000);
}
