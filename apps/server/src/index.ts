// apps/server/src/index.ts
// Kirish nuqtasi. Bitta jarayon API + World Engine + realtime ni ishga tushiradi (prototip).
// Masshtablashda: API_ENABLED=true ENGINE_ENABLED=false (N ta nusxa) va API_ENABLED=false ENGINE_ENABLED=true (1-2 nusxa).

import { createServer } from 'node:http';
import { createHttpServer } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { WorldEngine } from './engine/worldEngine.js';
import { migrate } from './migrate.js';
import { RealtimeHub } from './realtime/hub.js';
import type { Game } from './services/common.js';
import { registerBot } from './telegram/bot.js';

const cfg = loadConfig();
const pool = createPool(cfg.DATABASE_URL, cfg.DB_POOL_SIZE);
const game: Game = { pool, speed: cfg.GAME_SPEED, shieldHours: cfg.SHIELD_HOURS };

if (cfg.MIGRATE_ON_START) {
  const applied = await migrate(pool, cfg.MIGRATIONS_DIR || undefined);
  if (applied.length) console.log(`[db] migratsiyalar: ${applied.join(', ')}`);
}

const engine = cfg.ENGINE_ENABLED ? new WorldEngine(pool, game, cfg.ENGINE_POLL_MS) : undefined;
const metrics = new Map<string, number>();
const server = cfg.API_ENABLED ? createHttpServer({ cfg, pool, game, engine, metrics }) : createServer((_, res) => { res.writeHead(200); res.end('engine'); });
const hub = cfg.API_ENABLED ? new RealtimeHub(server, pool, cfg.JWT_SECRET) : undefined;
await hub?.listen();
await engine?.start();

if (cfg.API_ENABLED && cfg.TELEGRAM_BOT_TOKEN && cfg.PUBLIC_URL) {
  // Telegram'ga webhook va "O'ynash" menyu tugmasini o'rnatamiz (xato bo'lsa server baribir ishlayveradi)
  registerBot({ token: cfg.TELEGRAM_BOT_TOKEN, publicUrl: cfg.PUBLIC_URL, webhookSecret: cfg.TELEGRAM_WEBHOOK_SECRET }).catch(e => console.warn('[bot] ro\'yxatdan o\'tkazib bo\'lmadi:', e.message));
}

server.listen(cfg.PORT, () => {
  console.log(`[qirolliklar] ${cfg.API_ENABLED ? 'API' : ''}${cfg.ENGINE_ENABLED ? ' + World Engine' : ''} :${cfg.PORT} (GAME_SPEED=${cfg.GAME_SPEED}${cfg.DEV_AUTH ? ', DEV_AUTH' : ''})`);
});

const shutdown = async (sig: string) => {
  console.log(`[qirolliklar] ${sig}: to'xtatilmoqda`);
  engine?.stop();
  hub?.close();
  server.close();
  setTimeout(() => process.exit(0), 3000).unref();
  await pool.end().catch(() => {});
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
