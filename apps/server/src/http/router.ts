// apps/server/src/http/router.ts
// Kichik HTTP router: tashqi frameworksiz, shuning uchun har bir qatlam ko'rinib turadi.
// Har bir so'rov: xavfsizlik sarlavhalari -> CORS -> rate limit -> auth -> zod validatsiya -> handler.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const bad = (code: string, msg: string, details?: unknown) => new HttpError(400, code, msg, details);
export const forbidden = (code: string, msg: string) => new HttpError(403, code, msg);
export const notFound = (msg = 'Topilmadi') => new HttpError(404, 'not_found', msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

export interface Ctx<B = unknown> {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: B;
  ip: string;
  userId?: string;
  kingdomId?: string;
}

type Handler<B> = (ctx: Ctx<B>) => Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; auth: boolean; action: boolean; schema?: ZodTypeAny; handler: Handler<any> }

export class Router {
  routes: Route[] = [];
  add<S extends ZodTypeAny | undefined>(method: string, path: string, opts: { auth?: boolean; action?: boolean; schema?: S },
    handler: Handler<S extends ZodTypeAny ? z.infer<S> : undefined>) {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([0-9a-fA-F-]{36}|[a-z0-9_]+)'; }) + '$');
    this.routes.push({ method, re, keys, auth: opts.auth ?? true, action: opts.action ?? method !== 'GET', schema: opts.schema, handler });
  }
  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]!])) };
    }
    return null;
  }
}

export async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too_large', 'So\'rov juda katta');
    chunks.push(c as Buffer);
  }
  if (size === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('bad_json', 'JSON noto\'g\'ri'); }
}

export function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  // Telegram Web/Desktop Mini App'ni iframe ichida ochadi: faqat Telegram domenlariga ruxsat
  res.setHeader('content-security-policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
  res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
}
