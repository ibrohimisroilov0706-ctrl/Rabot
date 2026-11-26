// apps/client/src/api.ts
// Server bilan aloqa. Klient faqat niyat yuboradi; barcha hisob-kitob serverda (server-authoritative).

import { ERR } from './i18n.js';

const TOKEN_KEY = 'qrl_token';
let token: string | null = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* WebView cheklovi */ }

export const API_BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';
/** Oflayn rejim: VITE_OFFLINE=1 bilan build qilinganda server kerak emas, o'yin telefonda ishlaydi */
export const OFFLINE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_OFFLINE === '1';

export function setToken(t: string | null) {
  token = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* */ }
}
export const getToken = () => token;

export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details?: any) { super(message); } }

export async function api<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (OFFLINE) {
    const { localApi } = await import('./offline/engine.js');
    try { return await localApi(method, path, body) as T; }
    catch (e: any) {
      let msg = e.message ?? 'Xato';
      if (e.code === 'not_enough_resources' && e.details?.missing) msg += ': ' + Object.entries(e.details.missing).map(([k, v]) => `${k} ${v}`).join(', ');
      throw new ApiError(e.status ?? 400, e.code ?? 'error', msg, e.details);
    }
  }
  const r = await fetch(API_BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) setToken(null);
    let msg = json.message ?? ERR[json.error] ?? `Xato ${r.status}`;
    if (json.error === 'not_enough_resources' && json.details?.missing) {
      msg += ': ' + Object.entries(json.details.missing).map(([k, v]) => `${k} ${v}`).join(', ');
    }
    throw new ApiError(r.status, json.error ?? 'error', msg, json.details);
  }
  return json as T;
}

export function wsUrl(): string {
  const base = API_BASE || location.origin;
  return base.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token ?? '')}`;
}
