// apps/server/src/auth/token.ts
// Minimal HS256 JWT (tashqi kutubxonasiz). Sessiya 7 kun amal qiladi.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionClaims { uid: string; tg: number; exp: number }

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signToken(claims: Omit<SessionClaims, 'exp'>, secret: string, ttlSec = 7 * 86_400): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}
