// apps/server/src/app.ts
// HTTP API: barcha endpointlar shu yerda ro'yxatdan o'tadi. Har bir endpoint: zod sxemasi + auth + rate limit.
// To'liq ro'yxat: README "API" bo'limi.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { BUILDINGS, MAP_SIZE, MARKET_BASE_PRICE } from '@qirolliklar/game-rules';
import { z } from 'zod';
import { InitDataError, signInitData, verifyInitData } from './auth/telegram.js';
import { signToken, verifyToken } from './auth/token.js';
import type { Config } from './config.js';
import { one, tx, type Db } from './db.js';
import { HttpError, Router, bad, readJson, securityHeaders, send, type Ctx } from './http/router.js';
import { RateLimiter } from './http/rateLimit.js';
import { march, recruit } from './services/army.js';
import { audit, type Game } from './services/common.js';
import { cancelConstruction, startConstruction } from './services/construction.js';
import { breakTreaty, listDiplomacy, propose, respond } from './services/diplomacy.js';
import { assassinate, goHome, hireAgent, visit } from './services/intrigue.js';
import { battles, createKingdom, kingdomPublic, kingdoms, meView, notifications, world } from './services/kingdom.js';
import { history, prices, trade } from './services/market.js';
import { generosity, leaveService, offerService, respondService } from './services/service.js';
import { capitalOf, syncCity } from './services/city.js';
import type { WorldEngine } from './engine/worldEngine.js';
import { handleUpdate, isValidWebhook } from './telegram/bot.js';

const uuid = z.string().uuid();
const Culture = z.enum(['rus', 'ingliz', 'usmonli', 'temuriy', 'mogul']);
const Units = z.record(z.string().regex(/^[a-z_]{2,20}$/), z.number().int().min(0).max(100_000)).refine(u => Object.keys(u).length <= 16);
const Name = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[\p{L}\p{N} '‘’ʻʼ-]+$/u, 'Faqat harf, raqam va probel');

export interface AppDeps { cfg: Config; pool: Db; game: Game; engine?: WorldEngine; metrics: Map<string, number> }

export function buildRouter(d: AppDeps): Router {
  const r = new Router();
  const { cfg, pool, game } = d;
  const T = <X>(fn: (t: import('./db.js').Tx) => Promise<X>) => tx(pool, fn);
  const me = (c: Ctx<unknown>) => { if (!c.kingdomId) throw bad('no_kingdom', 'Avval qirollik yarating'); return c.kingdomId; };

  // ---------------- auth
  r.add('POST', '/api/auth/telegram', { auth: false, schema: z.object({ initData: z.string().min(10).max(4096) }) }, async c => {
    let u;
    try { u = verifyInitData(c.body.initData, cfg.TELEGRAM_BOT_TOKEN, cfg.INITDATA_MAX_AGE_SEC); }
    catch (e) { if (e instanceof InitDataError) throw new HttpError(401, 'bad_init_data', e.message); throw e; }
    return T(async t => {
      const row = await one<{ id: string; is_banned: boolean }>(t, `INSERT INTO users (telegram_id, username, first_name, language_code) VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, last_seen_at = now()
        RETURNING id, is_banned`, [u.id, u.username ?? null, u.first_name ?? '', u.language_code ?? 'uz']);
      if (row!.is_banned) throw new HttpError(403, 'banned', 'Hisob bloklangan');
      await audit(t, { userId: row!.id, action: 'login', ip: c.ip });
      return { token: signToken({ uid: row!.id, tg: u.id }, cfg.JWT_SECRET) };
    });
  });

  if (cfg.DEV_AUTH) {
    // Faqat lokal ishlab chiqish: Telegramsiz kirish. Productionda config buni taqiqlaydi.
    r.add('POST', '/api/auth/dev', { auth: false, schema: z.object({ telegramId: z.number().int().positive(), name: z.string().min(1).max(40) }) }, async c => {
      const token = 'dev-bot-token';
      const u = verifyInitData(signInitData({ id: c.body.telegramId, first_name: c.body.name }, token), token, 60);
      return T(async t => {
        const row = await one<{ id: string }>(t, `INSERT INTO users (telegram_id, first_name) VALUES ($1, $2)
          ON CONFLICT (telegram_id) DO UPDATE SET last_seen_at = now() RETURNING id`, [u.id, u.first_name]);
        return { token: signToken({ uid: row!.id, tg: u.id }, cfg.JWT_SECRET) };
      });
    });
  }

  // ---------------- o'yinchi
  r.add('GET', '/api/config', { auth: false }, async () => ({ mapSize: MAP_SIZE, gameSpeed: game.speed, buildings: Object.keys(BUILDINGS), market: MARKET_BASE_PRICE, devAuth: cfg.DEV_AUTH }));
  r.add('GET', '/api/me', {}, async c => T(t => meView(t, game, c.userId!)));
  r.add('POST', '/api/kingdom', { schema: z.object({ name: Name(3, 32), culture: Culture, cityName: Name(2, 40), rulerName: Name(2, 30).optional() }) },
    async c => T(async t => { const out = await createKingdom(t, game, c.userId!, c.body); await audit(t, { userId: c.userId, kingdomId: out.kingdomId, action: 'kingdom_create', ip: c.ip }); return out; }));

  // ---------------- shahar
  r.add('POST', '/api/city/build', { schema: z.object({ key: z.enum(Object.keys(BUILDINGS) as [string, ...string[]]).optional(), buildingId: uuid.optional() }).refine(b => !!b.key !== !!b.buildingId, 'key yoki buildingId') },
    async c => T(async t => { const out = await startConstruction(t, game, me(c), c.body as never); await audit(t, { kingdomId: me(c), action: 'build', ip: c.ip, details: out as never }); return out; }));
  r.add('POST', '/api/city/cancel', { schema: z.object({ queueId: uuid }) }, async c => T(t => cancelConstruction(t, game, me(c), c.body.queueId)));
  r.add('POST', '/api/city/tax', { schema: z.object({ taxPct: z.number().int().min(0).max(40) }) }, async c => T(async t => {
    const cityId = await capitalOf(t, me(c));
    await syncCity(t, game, cityId);
    await t.query('UPDATE cities SET tax_pct = $2 WHERE id = $1', [cityId, c.body.taxPct]);
    return { taxPct: c.body.taxPct };
  }));

  // ---------------- armiya
  r.add('POST', '/api/army/recruit', { schema: z.object({ unitKey: z.string().regex(/^[a-z_]{2,20}$/), count: z.number().int().min(1).max(500) }) },
    async c => T(async t => { const out = await recruit(t, game, me(c), c.body); await audit(t, { kingdomId: me(c), action: 'recruit', ip: c.ip, details: c.body }); return out; }));
  r.add('POST', '/api/army/march', { schema: z.object({ targetCityId: uuid, armyId: uuid.optional(), units: Units.optional(), commanderId: uuid.optional() }).refine(b => !!b.armyId !== !!b.units, 'armyId yoki units') },
    async c => T(t => march(t, game, me(c), c.body, c.ip)));

  // ---------------- dunyo
  r.add('GET', '/api/world', {}, async c => {
    const n = (k: string, dflt: number) => { const v = Number(c.query.get(k) ?? dflt); if (!Number.isFinite(v)) throw bad('bad_query', k); return Math.floor(v); };
    return T(t => world(t, n('x0', 0), n('y0', 0), n('x1', MAP_SIZE - 1), n('y1', MAP_SIZE - 1)));
  });
  r.add('GET', '/api/kingdoms', {}, async c => T(t => kingdoms(t, (c.query.get('q') ?? '').slice(0, 32))));
  r.add('GET', '/api/kingdoms/:id', {}, async c => T(t => kingdomPublic(t, c.kingdomId, c.params.id!)));

  // ---------------- xizmat
  r.add('POST', '/api/service/offer', { schema: z.object({
    hostKingdomId: uuid, status: z.enum(['yollanma', 'ittifoqchi', 'vassal']), units: Units,
    payPerHour: z.number().int().min(0).max(100_000).default(0), hours: z.number().int().min(1).max(720),
    commandLevel: z.number().int().min(0).max(2).default(1), tributePct: z.number().int().min(0).max(30).default(0),
  }) }, async c => T(t => offerService(t, game, me(c), c.body, c.ip)));
  r.add('POST', '/api/service/:id/accept', {}, async c => T(t => respondService(t, game, me(c), c.params.id!, true)));
  r.add('POST', '/api/service/:id/reject', {}, async c => T(t => respondService(t, game, me(c), c.params.id!, false)));
  r.add('POST', '/api/service/:id/leave', {}, async c => T(t => leaveService(t, game, me(c), c.params.id!)));
  r.add('POST', '/api/service/:id/generosity', {}, async c => T(t => generosity(t, game, me(c), c.params.id!)));

  // ---------------- diplomatiya
  r.add('GET', '/api/diplomacy', {}, async c => T(t => listDiplomacy(t, me(c))));
  r.add('POST', '/api/diplomacy/propose', { schema: z.object({ toKingdomId: uuid, type: z.enum(['ittifoq', 'savdo', 'tinchlik', 'urush', 'nikoh']), hours: z.number().int().min(1).max(2160) }) },
    async c => T(t => propose(t, game, me(c), c.body)));
  r.add('POST', '/api/diplomacy/:id/accept', {}, async c => T(t => respond(t, game, me(c), c.params.id!, true)));
  r.add('POST', '/api/diplomacy/:id/reject', {}, async c => T(t => respond(t, game, me(c), c.params.id!, false)));
  r.add('POST', '/api/diplomacy/:id/break', {}, async c => T(t => breakTreaty(t, me(c), c.params.id!)));

  // ---------------- saroy, suiqasd
  r.add('POST', '/api/king/visit', { schema: z.object({ cityId: uuid }) }, async c => T(t => visit(t, me(c), c.body.cityId)));
  r.add('POST', '/api/king/home', {}, async c => T(t => goHome(t, me(c))));
  r.add('POST', '/api/intrigue/agents', {}, async c => T(t => hireAgent(t, game, me(c))));
  r.add('POST', '/api/intrigue/assassinate', { schema: z.object({ targetKingdomId: uuid, agentId: uuid, prepGold: z.number().int().min(0).max(5000) }) },
    async c => T(t => assassinate(t, game, me(c), c.body, c.ip)));

  // ---------------- savdo
  r.add('GET', '/api/market', {}, async c => T(async t => {
    const k = await one<{ culture: 'rus' }>(t, 'SELECT culture FROM kingdoms WHERE id = $1', [me(c)]);
    return { prices: await prices(t, game, k!.culture), history: await history(t, me(c)) };
  }));
  r.add('POST', '/api/market/trade', { schema: z.object({ resource: z.enum(['food', 'wood', 'stone', 'iron', 'horses']), side: z.enum(['buy', 'sell']), amount: z.number().int().min(1).max(5000) }) },
    async c => T(t => trade(t, game, me(c), c.body, c.ip)));

  // ---------------- tarix va xabarlar
  r.add('GET', '/api/battles', {}, async c => T(t => battles(t, me(c))));
  r.add('GET', '/api/notifications', {}, async c => T(t => notifications(t, me(c))));
  r.add('POST', '/api/notifications/read', {}, async c => T(async t => { await t.query('UPDATE notifications SET read_at = now() WHERE kingdom_id = $1 AND read_at IS NULL', [me(c)]); return { ok: true }; }));

  return r;
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

async function serveStatic(dir: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  const root = path.resolve(dir);
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(root, safe);
  if (!file.startsWith(root)) return false; // path traversal himoyasi
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(root, 'index.html'); }
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(data);
    return true;
  } catch { return false; }
}

export function createHttpServer(d: AppDeps) {
  const router = buildRouter(d);
  const readLimiter = new RateLimiter(20, 60);
  const actionLimiter = new RateLimiter(4, 15);
  const authLimiter = new RateLimiter(0.5, 10);
  const { cfg, metrics } = d;
  const inc = (k: string) => metrics.set(k, (metrics.get(k) ?? 0) + 1);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const t0 = Date.now();
    securityHeaders(res);
    const origin = req.headers.origin;
    if (origin && (cfg.CORS_ORIGIN === '*' || cfg.CORS_ORIGIN.split(',').includes(origin))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const ip = (cfg.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') || req.socket.remoteAddress || '?';

    if (url.pathname === '/healthz') {
      try { await d.pool.query('SELECT 1'); send(res, 200, { ok: true, engine: d.engine?.stats ?? null }); }
      catch { send(res, 503, { ok: false }); }
      return;
    }
    if (url.pathname === '/metrics') {
      const lines = [...metrics].map(([k, v]) => `qrl_${k} ${v}`);
      if (d.engine) lines.push(`qrl_engine_processed ${d.engine.stats.processed}`, `qrl_engine_failed ${d.engine.stats.failed}`, `qrl_engine_lag_ms ${d.engine.stats.lagMs}`);
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end(lines.join('\n') + '\n'); return;
    }
    if (url.pathname === '/telegram/webhook' && req.method === 'POST') {
      const botCfg = { token: cfg.TELEGRAM_BOT_TOKEN, publicUrl: cfg.PUBLIC_URL, webhookSecret: cfg.TELEGRAM_WEBHOOK_SECRET };
      if (!isValidWebhook(req.headers['x-telegram-bot-api-secret-token'] as string | undefined, botCfg)) { send(res, 401, { error: 'unauthorized' }); return; }
      try { const update = await readJson(req); await handleUpdate(update, botCfg); } catch (e) { console.warn('[bot] update xato', (e as Error).message); }
      send(res, 200, { ok: true }); return;
    }
    if (!url.pathname.startsWith('/api/')) {
      if (cfg.STATIC_DIR && (req.method === 'GET' || req.method === 'HEAD') && await serveStatic(cfg.STATIC_DIR, url.pathname, res)) return;
      send(res, 404, { error: 'not_found' }); return;
    }

    try {
      const m = router.match(req.method ?? 'GET', url.pathname);
      if (!m) throw new HttpError(404, 'not_found', 'Endpoint topilmadi');
      const ctx: Ctx<unknown> = { req, res, params: m.params, query: url.searchParams, body: undefined, ip };
      if (m.route.auth) {
        const h = req.headers.authorization ?? '';
        const claims = h.startsWith('Bearer ') ? verifyToken(h.slice(7), cfg.JWT_SECRET) : null;
        if (!claims) throw new HttpError(401, 'unauthorized', 'Qayta kiring');
        ctx.userId = claims.uid;
        const k = await one<{ id: string; banned: boolean }>(d.pool, 'SELECT k.id, u.is_banned AS banned FROM users u LEFT JOIN kingdoms k ON k.user_id = u.id WHERE u.id = $1', [claims.uid]);
        if (!k) throw new HttpError(401, 'unauthorized', 'Foydalanuvchi topilmadi');
        if (k.banned) throw new HttpError(403, 'banned', 'Hisob bloklangan');
        ctx.kingdomId = k.id ?? undefined;
      }
      const key = ctx.userId ?? `ip:${ip}`;
      const limiter = !m.route.auth ? authLimiter : m.route.action ? actionLimiter : readLimiter;
      if (!limiter.take(key)) { inc('rate_limited'); throw new HttpError(429, 'rate_limited', 'Juda ko\'p so\'rov, biroz kuting'); }
      const raw = await readJson(req);
      if (m.route.schema) {
        const p = m.route.schema.safeParse(raw ?? {});
        if (!p.success) throw bad('validation', 'Ma\'lumot noto\'g\'ri', p.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
        ctx.body = p.data;
      }
      const out = await m.route.handler(ctx);
      inc('http_ok');
      send(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) { inc(`http_${e.status}`); send(res, e.status, { error: e.code, message: e.message, details: e.details }); }
      else if ((e as { code?: string }).code === '23505') { inc('http_409'); send(res, 409, { error: 'conflict', message: 'Bu amal allaqachon bajarilgan yoki nom band' }); }
      else if ((e as { code?: string }).code === '23514') { inc('http_409'); send(res, 409, { error: 'constraint', message: 'Qoida buzildi (resurs yoki chegara)' }); }
      else { inc('http_500'); console.error('[http] xato', req.method, url.pathname, e); send(res, 500, { error: 'internal', message: 'Server xatosi' }); }
    } finally {
      const ms = Date.now() - t0;
      if (ms > 500) console.warn(`[http] sekin: ${req.method} ${url.pathname} ${ms}ms`);
    }
  });
}
