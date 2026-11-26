// apps/server/test/integration.test.ts
// Haqiqiy PostgreSQL bilan uchidan-uchigacha test. Bo'sh baza kerak:
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/qirolliklar_test npm test -w @qirolliklar/server
// Baza har ishga tushishda tozalanadi (public schema qayta yaratiladi).

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createHttpServer } from '../src/app.js';
import { signInitData } from '../src/auth/telegram.js';
import type { Config } from '../src/config.js';
import { createPool, many, one, tx } from '../src/db.js';
import { WorldEngine } from '../src/engine/worldEngine.js';
import { migrate } from '../src/migrate.js';
import type { Game } from '../src/services/common.js';

const DB = process.env.TEST_DATABASE_URL;
const BOT = '123456:TEST-BOT-TOKEN';

describe('QIROLLIKLAR server (integratsiya)', { skip: !DB && 'TEST_DATABASE_URL berilmagan' }, () => {
  const pool = createPool(DB ?? 'postgres://x@localhost/x', 10);
  const game: Game = { pool, speed: 36_000, shieldHours: 0 }; // 1 real soniya = 10 o'yin soati
  const engine = new WorldEngine(pool, game, 50);
  const cfg = {
    NODE_ENV: 'test', PORT: 0, DATABASE_URL: DB, DB_POOL_SIZE: 10, JWT_SECRET: 'x'.repeat(40), TELEGRAM_BOT_TOKEN: BOT,
    INITDATA_MAX_AGE_SEC: 3600, DEV_AUTH: true, CORS_ORIGIN: '*', GAME_SPEED: game.speed, SHIELD_HOURS: 0, ENGINE_ENABLED: false,
    ENGINE_POLL_MS: 50, API_ENABLED: true, MIGRATE_ON_START: false, MIGRATIONS_DIR: '', STATIC_DIR: '', TRUST_PROXY: false, PUBLIC_URL: '', TELEGRAM_WEBHOOK_SECRET: 'whs',
  } as Config;
  const server = createHttpServer({ cfg, pool, game, engine, metrics: new Map() });
  let base = '';
  const tokens: Record<string, string> = {};
  const ids: Record<string, { kingdomId: string; cityId: string }> = {};

  async function api(who: string | null, method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await r.json() as any;
    return { status: r.status, body: json };
  }
  const ok = async (who: string, method: string, path: string, body?: unknown) => {
    const r = await api(who, method, path, body);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  /** Resursni test uchun o'rnatadi (simulyatsiya soatini ham yangilab, oradagi ishlab chiqarish qo'shilmasin) */
  const setRes = async (cityId: string, r: Record<string, number>) => {
    const sets = Object.keys(r).map((k, i) => `${k} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE resources SET ${sets} WHERE city_id = $1`, [cityId, ...Object.values(r)]);
    await pool.query('UPDATE cities SET last_simulated_at = now() WHERE id = $1', [cityId]);
  };

  before(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  test('T-01 Telegram initData: to\'g\'ri imzo 200, soxta imzo 401', async () => {
    const good = signInitData({ id: 777, first_name: 'Aziz' }, BOT);
    const r1 = await api(null, 'POST', '/api/auth/telegram', { initData: good });
    assert.equal(r1.status, 200);
    assert.ok(r1.body.token);
    const bad = good.replace(/hash=[0-9a-f]+/, 'hash=' + 'a'.repeat(64));
    assert.equal((await api(null, 'POST', '/api/auth/telegram', { initData: bad })).status, 401);
    const old = signInitData({ id: 777, first_name: 'Aziz' }, BOT, Math.floor(Date.now() / 1000) - 7200);
    assert.equal((await api(null, 'POST', '/api/auth/telegram', { initData: old })).status, 401);
  });

  test('T-02 uchta qirollik yaratiladi, token bo\'lmasa 401', async () => {
    assert.equal((await api(null, 'GET', '/api/me')).status, 401);
    for (const [who, tg, culture] of [['A', 1001, 'rus'], ['B', 1002, 'temuriy'], ['C', 1003, 'usmonli']] as const) {
      tokens[who] = (await api(null, 'POST', '/api/auth/dev', { telegramId: tg, name: who })).body.token;
      const k = await ok(who, 'POST', '/api/kingdom', { name: `Qirollik ${who}`, culture, cityName: `Shahar ${who}` });
      ids[who] = { kingdomId: k.kingdomId, cityId: k.cityId };
    }
    const dup = await api('A', 'POST', '/api/kingdom', { name: 'Boshqa', culture: 'rus', cityName: 'Xiva' });
    assert.equal(dup.status, 409);
    const me = await ok('A', 'GET', '/api/me');
    assert.equal(me.kingdom.culture, 'rus');
    assert.equal(me.city.buildings.length, 8);
    assert.ok(me.armies.some((a: any) => a.kind === 'garrison' && a.units.piyoda === 60));
  });

  test('T-03 qurilish: navbat chegarasi, saroy qoidasi, tugash', async () => {
    const me = await ok('A', 'GET', '/api/me');
    const saroy = me.city.buildings.find((b: any) => b.key === 'saroy');
    const ombor = me.city.buildings.find((b: any) => b.key === 'ombor');
    // ombor 2 > saroy 1: ruxsat yo'q
    const low = await api('A', 'POST', '/api/city/build', { buildingId: ombor.id });
    assert.equal(low.status, 409);
    assert.equal(low.body.error, 'palace_low');
    await ok('A', 'POST', '/api/city/build', { buildingId: saroy.id }); // saroy 2 (ombor 1 >= 2-1)
    const full = await api('A', 'POST', '/api/city/build', { key: 'devor' });
    assert.equal(full.status, 409);
    assert.equal(full.body.error, 'queue_full');
    await engine.drain(5000);
    await ok('A', 'POST', '/api/city/build', { buildingId: ombor.id });
    await engine.drain(5000);
    const me2 = await ok('A', 'GET', '/api/me');
    assert.equal(me2.city.buildings.find((b: any) => b.key === 'saroy').level, 2);
    assert.equal(me2.city.buildings.find((b: any) => b.key === 'ombor').level, 2);
    await ok('A', 'POST', '/api/city/build', { key: 'devor' });
    await engine.drain(5000);
    const me3 = await ok('A', 'GET', '/api/me');
    assert.ok(me3.city.wallHp >= 1000, 'devor HP o\'rnatildi');
    // bekor qilish 80% qaytaradi va yangi binoni o'chiradi
    const q = await ok('A', 'POST', '/api/city/build', { key: 'bozor' });
    const cancel = await ok('A', 'POST', '/api/city/cancel', { queueId: q.queueId });
    assert.ok(cancel.refunded.wood > 0);
    assert.equal((await one(pool, "SELECT count(*)::int AS n FROM buildings WHERE id = $1", [q.buildingId]))!.n, 0);
  });

  test('T-04 resurs yetmasa hech narsa yechilmaydi', async () => {
    await setRes(ids.B!.cityId, { wood: 1, stone: 1 });
    const before = await one(pool, 'SELECT gold FROM resources WHERE city_id = $1', [ids.B!.cityId]);
    const r = await api('B', 'POST', '/api/city/build', { key: 'devor' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'not_enough_resources');
    const afterRow = await one(pool, 'SELECT gold FROM resources WHERE city_id = $1', [ids.B!.cityId]);
    assert.ok(Math.abs(afterRow!.gold - before!.gold) < 50, 'oltin deyarli o\'zgarmagan (faqat simulyatsiya)');
    assert.equal((await one(pool, "SELECT count(*)::int AS n FROM buildings WHERE city_id = $1 AND key = 'devor'", [ids.B!.cityId]))!.n, 0);
    await setRes(ids.B!.cityId, { wood: 2000, stone: 2000 });
  });

  test('T-05 yollash va bozor', async () => {
    await setRes(ids.A!.cityId, { gold: 3000, food: 2000, wood: 1500, iron: 500 });
    await ok('A', 'POST', '/api/army/recruit', { unitKey: 'piyoda', count: 20 });
    const badUnit = await api('A', 'POST', '/api/army/recruit', { unitKey: 'yangicheri', count: 1 });
    assert.equal(badUnit.status, 400); // Usmonli birligi
    await engine.drain(5000);
    const me = await ok('A', 'GET', '/api/me');
    assert.equal(me.armies.find((a: any) => a.kind === 'garrison').units.piyoda, 80);
    const m = await ok('A', 'GET', '/api/market');
    assert.ok(m.prices.wood > 0);
    const tr = await ok('A', 'POST', '/api/market/trade', { resource: 'wood', side: 'buy', amount: 100 });
    assert.ok(tr.unitPrice > 0.59 && tr.fee > 0);
  });

  test('T-06 hujum: jang yoziladi, yo\'qotishlar va tarix', async () => {
    const r = await ok('A', 'POST', '/api/army/march', { targetCityId: ids.B!.cityId, units: { piyoda: 70, kamonchi: 30 } });
    assert.ok(r.armyId);
    const over = await api('A', 'POST', '/api/army/march', { targetCityId: ids.B!.cityId, units: { piyoda: 1000 } });
    assert.equal(over.status, 409);
    await engine.drain(15_000);
    const b = await ok('A', 'GET', '/api/battles');
    assert.equal(b.length, 1);
    assert.ok(['attacker', 'defender'].includes(b[0].winner));
    assert.ok(b[0].records.length >= 2);
    const nB = await ok('B', 'GET', '/api/notifications');
    assert.ok(nB.some((n: any) => n.type === 'jang'));
    // qayta hisoblash: saqlangan input bilan natija bir xil (determinizm, anti-cheat)
    const row = await one(pool, 'SELECT input, winner, ratio FROM battles WHERE id = $1', [b[0].id]);
    const { resolveBattle } = await import('@qirolliklar/game-rules');
    const again = resolveBattle(row!.input);
    assert.equal(again.winner, row!.winner);
  });

  test('T-07 yollanma qo\'shin: egalik o\'zgarmaydi, buyruq faqat shartnoma bo\'yicha, sadoqat hisobi', async () => {
    const off = await ok('C', 'POST', '/api/service/offer', { hostKingdomId: ids.A!.kingdomId, status: 'yollanma', units: { piyoda: 40, nayzachi: 20 }, payPerHour: 10, hours: 720, commandLevel: 1 });
    const notHost = await api('B', 'POST', `/api/service/${off.serviceId}/accept`);
    assert.equal(notHost.status, 403);
    await ok('A', 'POST', `/api/service/${off.serviceId}/accept`);
    await engine.drain(15_000);
    let army = await one(pool, 'SELECT * FROM armies WHERE id = $1', [off.armyId]);
    assert.equal(army!.owner_kingdom_id, ids.C!.kingdomId, 'asl egasi C');
    assert.equal(army!.serving_kingdom_id, ids.A!.kingdomId, 'xizmatda A');
    assert.equal(army!.status, 'stationed');
    // C (egasi) xizmatdagi qo'shinini o'zi yubora olmaydi; B umuman buyruq bera olmaydi
    assert.equal((await api('C', 'POST', '/api/army/march', { targetCityId: ids.B!.cityId, armyId: off.armyId })).status, 403);
    assert.equal((await api('B', 'POST', '/api/army/march', { targetCityId: ids.C!.cityId, armyId: off.armyId })).status, 403);
    // Qo'shinni o'z egasiga qarshi yuborib bo'lmaydi
    assert.equal((await api('A', 'POST', '/api/army/march', { targetCityId: ids.C!.cityId, armyId: off.armyId })).status, 403);
    // A uch marta B ga yuboradi
    let battles = 0;
    for (let i = 0; i < 3; i++) {
      const cur = await one(pool, "SELECT status FROM armies WHERE id = $1", [off.armyId]);
      if (!cur || cur.status !== 'stationed') break;
      await pool.query('UPDATE kingdoms SET shield_until = NULL WHERE id = $1', [ids.B!.kingdomId]); // talangandan keyingi 48 soatlik qalqonni test uchun olib tashlaymiz
      await ok('A', 'POST', '/api/army/march', { targetCityId: ids.B!.cityId, armyId: off.armyId });
      await engine.drain(20_000);
      battles++;
    }
    const svc = await one(pool, 'SELECT * FROM army_service WHERE id = $1', [off.serviceId]);
    assert.ok(svc, 'shartnoma tarixi saqlanadi (qo\'shin yo\'q bo\'lsa ham)');
    assert.equal(svc!.total_wins + svc!.total_losses, battles, 'har jang hisoblandi');
    army = await one(pool, 'SELECT * FROM armies WHERE id = $1', [off.armyId]);
    if (army) assert.equal(army.owner_kingdom_id, ids.C!.kingdomId, 'jangdan keyin ham egasi C');
    assert.equal(battles, 3, '3 ta jang o\'tkazildi');
    if (battles === 3) {
      // N=3 bo'lgach qoida ishlagan bo'lishi shart: R2 (tarqalish) yoki R3 (mustaqillik hodisasi)
      // qo'shin qirilib ketgan bo'lsa army_id NULL bo'ladi, shuning uchun egasi bo'yicha qidiramiz
      const reb = await many(pool, "SELECT kind FROM rebellions WHERE kingdom_id = $1 AND kind LIKE 'qoshin%'", [ids.C!.kingdomId]);
      const indep = await one(pool, "SELECT 1 FROM game_events WHERE type = 'independence_resolve' AND payload->>'serviceId' = $1", [off.serviceId]);
      assert.ok(reb.length > 0 || indep, 'sadoqat qoidasi ishga tushdi');
      assert.equal(svc!.wins + svc!.losses, 0, 'R6: hisob nolga tushdi');
    }
  });

  test('T-08 maosh soatlik hisoblanadi', async () => {
    const svc = await one<{ id: string }>(pool, "SELECT id FROM army_service WHERE state = 'faol' LIMIT 1");
    if (!svc) return; // qo'shin mustaqil bo'lib ketgan bo'lishi mumkin
    await new Promise(r => setTimeout(r, 300));
    const { settleAll } = await import('../src/services/service.js');
    await tx(pool, t => settleAll(t, game));
    const s = await one(pool, 'SELECT paid_total, owed_total FROM army_service WHERE id = $1', [svc.id]);
    assert.ok(s!.owed_total > 0);
    assert.ok(s!.paid_total > 0);
  });

  test('T-09 tinchlik shartnomasi hujumni bloklaydi', async () => {
    const p = await ok('A', 'POST', '/api/diplomacy/propose', { toKingdomId: ids.B!.kingdomId, type: 'tinchlik', hours: 72 });
    assert.equal((await api('A', 'POST', `/api/diplomacy/${p.id}/accept`)).status, 403); // taklif qiluvchi qabul qila olmaydi
    await ok('B', 'POST', `/api/diplomacy/${p.id}/accept`);
    await pool.query('UPDATE kingdoms SET shield_until = NULL WHERE id = $1', [ids.B!.kingdomId]);
    const r = await api('A', 'POST', '/api/army/march', { targetCityId: ids.B!.cityId, units: { piyoda: 1 } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'peace');
    assert.equal((await api('A', 'POST', `/api/diplomacy/${p.id}/break`)).status, 403);
  });

  test('T-10 suiqasd: faqat mehmon qirol nishon bo\'ladi', async () => {
    // C elchixona quradi va agent yollaydi
    await setRes(ids.C!.cityId, { gold: 5000, wood: 3000, stone: 3000 });
    await ok('C', 'POST', '/api/city/build', { key: 'elchixona' });
    await engine.drain(5000);
    const ag = await ok('C', 'POST', '/api/intrigue/agents');
    assert.equal((await api('C', 'POST', '/api/intrigue/agents')).body.error, 'agent_limit');
    // A o'z saroyida: nishon emas (A1/A2)
    const home = await api('C', 'POST', '/api/intrigue/assassinate', { targetKingdomId: ids.A!.kingdomId, agentId: ag.agentId, prepGold: 0 });
    assert.equal(home.status, 403);
    assert.equal(home.body.error, 'not_guest');
    // A B saroyiga mehmon bo'lib boradi -> endi nishon
    await ok('A', 'POST', '/api/king/visit', { cityId: ids.B!.cityId });
    const res = await ok('C', 'POST', '/api/intrigue/assassinate', { targetKingdomId: ids.A!.kingdomId, agentId: ag.agentId, prepGold: 500 });
    assert.ok(res.pSuccess >= 0.03 && res.pSuccess <= 0.55);
    const again = await api('C', 'POST', '/api/intrigue/assassinate', { targetKingdomId: ids.A!.kingdomId, agentId: ag.agentId, prepGold: 0 });
    // muvaffaqiyatli bo'lsa yangi qirol uyda (403 not_guest); aks holda 24 soat kutish yoki agent asir (409)
    assert.ok(res.success ? again.status === 403 : again.status === 409, `kutilmagan ${again.status}`);
    const kA = await one(pool, 'SELECT ruler_generation FROM kingdoms WHERE id = $1', [ids.A!.kingdomId]);
    assert.equal(kA!.ruler_generation, res.success ? 2 : 1, 'muvaffaqiyatli bo\'lsa vorislik ishladi');
  });

  test('T-11 validatsiya va xavfsizlik', async () => {
    assert.equal((await api('A', 'POST', '/api/army/recruit', { unitKey: 'piyoda', count: -5 })).status, 400);
    assert.equal((await api('A', 'POST', '/api/city/tax', { taxPct: 99 })).status, 400);
    assert.equal((await api('A', 'POST', '/api/kingdom', { name: '<script>', culture: 'rus', cityName: 'x' })).status, 400);
    const r = await fetch(base + '/api/me', { headers: { authorization: 'Bearer abc.def.ghi' } });
    assert.equal(r.status, 401);
    const audit = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM audit_logs');
    assert.ok(audit!.n > 5);
  });

  test('T-13 bot webhook: secret bo\'lmasa 401', async () => {
    const bad = await fetch(base + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(bad.status, 401);
    const good = await fetch(base + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'whs' }, body: JSON.stringify({ message: { chat: { id: 1 }, text: 'salom' } }) });
    assert.equal(good.status, 200);
  });

  test('T-12 hodisalar navbatida muvaffaqiyatsiz hodisa qolmadi', async () => {
    const failed = await many(pool, "SELECT type, last_error FROM game_events WHERE state = 'failed' OR (state = 'pending' AND attempts > 0)");
    assert.deepEqual(failed, []);
  });
});
