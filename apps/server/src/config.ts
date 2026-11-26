// apps/server/src/config.ts
// Muhit o'zgaruvchilari. Noto'g'ri sozlamada server ishga tushmaydi (fail fast).

import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.coerce.number().int().min(2).max(200).default(20),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET kamida 32 belgi bo\'lsin'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  INITDATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86_400),
  DEV_AUTH: bool.default('false'),
  CORS_ORIGIN: z.string().default('*'),
  GAME_SPEED: z.coerce.number().min(1).max(10_000).default(1),
  SHIELD_HOURS: z.coerce.number().min(0).max(240).default(72),
  ENGINE_ENABLED: bool.default('true'),
  ENGINE_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  API_ENABLED: bool.default('true'),
  MIGRATE_ON_START: bool.default('true'),
  MIGRATIONS_DIR: z.string().default(''),
  STATIC_DIR: z.string().default(''),
  TRUST_PROXY: bool.default('false'),
  PUBLIC_URL: z.string().default(''),                 // masalan https://1-2-3-4.sslip.io (bot webhook va Mini App manzili)
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Sozlama xatosi:\n${msg}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && c.DEV_AUTH) throw new Error('DEV_AUTH productionda yoqilishi mumkin emas');
  if (c.NODE_ENV === 'production' && !c.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN productionda majburiy');
  return c;
}
