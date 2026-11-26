// apps/server/src/engine/worldEngine.ts
// Markaziy World Engine: 10 000 ta alohida taymer o'rniga bitta navbat (game_events, due_at indeksi).
// Bir nechta engine nusxasi bir vaqtda ishlashi mumkin: FOR UPDATE SKIP LOCKED har hodisani faqat bittasiga beradi.
// Har hodisa o'z tranzaksiyasida bajariladi va "done" belgisi shu tranzaksiyada qo'yiladi (aynan bir marta).

import type { Db, Tx } from '../db.js';
import { many, one, tx } from '../db.js';
import { handleArrival } from '../services/battle.js';
import { completeRecruit } from '../services/army.js';
import { realDelay, schedule, notify, type Game } from '../services/common.js';
import { completeConstruction } from '../services/construction.js';
import { dailyTrust, expireTreaty } from '../services/diplomacy.js';
import { closeService, economicDesertion, resolveIndependence, settleAll } from '../services/service.js';
import { syncCity } from '../services/city.js';

type Handler = (t: Tx, g: Game, payload: any) => Promise<unknown>;

export const HANDLERS: Record<string, Handler> = {
  construction_complete: completeConstruction,
  recruit_complete: completeRecruit,
  army_arrival: handleArrival,
  service_expire: async (t, g, p: { serviceId: string }) => closeService(t, g, p.serviceId, 'muddat_tugadi'),
  independence_resolve: resolveIndependence,
  treaty_expire: async (t, _g, p) => expireTreaty(t, p),
  hourly_tick: hourlyTick,
  daily_tick: dailyTick,
};

/** Har o'yin soatida: maosh/o'lpon, iqtisodiy tarqalish, fuqarolar qo'zg'oloni, urush charchog'i kamayishi. */
async function hourlyTick(t: Tx, g: Game) {
  await settleAll(t, g);
  await economicDesertion(t, g);
  const restless = await many<{ id: string; kingdom_id: string; name: string }>(t,
    "SELECT id, kingdom_id, name FROM cities WHERE low_happiness_since IS NOT NULL AND low_happiness_since < now() - make_interval(secs => $1)", [realDelay(g, 24 * 3_600_000) / 1000]);
  for (const c of restless) {
    await syncCity(t, g, c.id);
    await t.query("UPDATE cities SET population = population * 0.95, low_happiness_since = now() WHERE id = $1", [c.id]);
    await t.query(`INSERT INTO rebellions (kingdom_id, city_id, kind, details) VALUES ($1, $2, 'fuqarolar', '{"aholi_yoqotildi":"5%"}'::jsonb)`, [c.kingdom_id, c.id]);
    await notify(t, c.kingdom_id, 'qozgolon', `${c.name}da fuqarolar qo'zg'oloni`, 'Baxt 24 soatdan beri 15 dan past. Soliqni kamaytiring yoki oziq toping.');
  }
  await t.query('UPDATE cities SET war_weariness = GREATEST(0, war_weariness - 1) WHERE war_weariness > 0');
  await t.query("UPDATE kingdoms SET regent_until = NULL WHERE regent_until IS NOT NULL AND regent_until < now()");
  await schedule(t, 'hourly_tick', new Date(Date.now() + realDelay(g, 3_600_000)), {}, 'hourly_tick');
}

async function dailyTick(t: Tx, g: Game) {
  await dailyTrust(t);
  // Eski bajarilgan hodisalarni tozalash (7 kundan eski)
  await t.query("DELETE FROM game_events WHERE state = 'done' AND created_at < now() - interval '7 days'");
  await schedule(t, 'daily_tick', new Date(Date.now() + realDelay(g, 24 * 3_600_000)), {}, 'daily_tick');
}

export interface EngineStats { processed: number; failed: number; lastBatchMs: number; lagMs: number }

export class WorldEngine {
  stats: EngineStats = { processed: 0, failed: 0, lastBatchMs: 0, lagMs: 0 };
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private pool: Db, private g: Game, private pollMs = 1000, private batch = 100) {}

  async start() {
    // singleton hodisalar mavjudligini kafolatlash
    await tx(this.pool, async t => {
      await schedule(t, 'hourly_tick', new Date(Date.now() + 60_000), {}, 'hourly_tick');
      await schedule(t, 'daily_tick', new Date(Date.now() + realDelay(this.g, 24 * 3_600_000)), {}, 'daily_tick');
    });
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try { while (this.running && (await this.tick()) === this.batch); } catch (e) { console.error('[engine] tick xato', e); }
      if (this.running) this.timer = setTimeout(loop, this.pollMs);
    };
    void loop();
  }
  stop() { this.running = false; if (this.timer) clearTimeout(this.timer); }

  /** Bitta partiya: muddati kelgan hodisalarni oladi va bajaradi. Qaytaradi: olingan hodisalar soni. */
  async tick(): Promise<number> {
    const t0 = Date.now();
    // 5 daqiqadan beri "processing" da qolganlar (server qulagan) qaytadan navbatga
    await this.pool.query("UPDATE game_events SET state = 'pending' WHERE state = 'processing' AND locked_at < now() - interval '5 minutes'");
    const claimed = await many<{ id: string; type: string; payload: unknown; attempts: number; due_at: Date }>(this.pool, `
      UPDATE game_events SET state = 'processing', locked_at = now(), attempts = attempts + 1
      WHERE id IN (SELECT id FROM game_events WHERE state = 'pending' AND due_at <= now() ORDER BY due_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id::text AS id, type, payload, attempts, due_at`, [this.batch]);
    claimed.sort((a, b) => a.due_at.getTime() - b.due_at.getTime());
    for (const ev of claimed) {
      this.stats.lagMs = Math.max(0, Date.now() - ev.due_at.getTime());
      const h = HANDLERS[ev.type];
      try {
        await tx(this.pool, async t => {
          if (!h) throw new Error(`noma'lum hodisa turi: ${ev.type}`);
          // avval "done": handler o'zini qayta rejalashtirsa (dedupe_key) to'qnashuv bo'lmasin; xato bo'lsa rollback qaytaradi
          await t.query("UPDATE game_events SET state = 'done' WHERE id = $1", [ev.id]);
          await h(t, this.g, ev.payload);
        });
        this.stats.processed++;
      } catch (e) {
        this.stats.failed++;
        const msg = (e as Error).message?.slice(0, 500) ?? String(e);
        console.error(`[engine] ${ev.type}#${ev.id} xato:`, msg);
        const final = ev.attempts >= 5;
        await this.pool.query(`UPDATE game_events SET state = $2, last_error = $3, due_at = now() + make_interval(secs => $4) WHERE id = $1`,
          [ev.id, final ? 'failed' : 'pending', msg, 2 ** ev.attempts]);
      }
    }
    this.stats.lastBatchMs = Date.now() - t0;
    return claimed.length;
  }

  /** Testlar uchun: navbat bo'shaguncha (yoki deadline gacha) ishlatadi. */
  async drain(untilMs = 10_000): Promise<void> {
    const end = Date.now() + untilMs;
    while (Date.now() < end) {
      const n = await this.tick();
      const next = await one<{ due: Date | null }>(this.pool, "SELECT min(due_at) AS due FROM game_events WHERE state = 'pending' AND type NOT IN ('hourly_tick','daily_tick')");
      if (n === 0 && (!next?.due || next.due.getTime() > end)) return;
      if (n === 0) await new Promise(r => setTimeout(r, Math.min(200, Math.max(10, next!.due!.getTime() - Date.now()))));
    }
  }
}
