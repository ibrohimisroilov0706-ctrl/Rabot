// apps/server/src/realtime/hub.ts
// Real vaqt qatlami: WebSocket (/ws). Server-authoritative: klient bu kanal orqali hech narsa o'zgartira olmaydi,
// faqat "nimadir o'zgardi" signalini oladi va REST orqali yangi holatni so'raydi.
// Manba: PostgreSQL LISTEN/NOTIFY (qrl_rt kanali) - API va World Engine alohida jarayonlarda bo'lsa ham ishlaydi.
//
// Design Decision: topshiriqda Colyseus ko'rsatilgan. Prototipda harakat va jang serverda hisoblanadi (D-12),
// shuning uchun xona sinxronizatsiyasi kerak emas: oddiy ws + pg NOTIFY yetarli. Real vaqtli taktik rejim
// qo'shilsa, Colyseus shu interfeys (push/broadcast) ortiga ulanadi.

import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Db } from '../db.js';
import { one } from '../db.js';
import { verifyToken } from '../auth/token.js';
import { RT_CHANNEL } from '../services/common.js';

export class RealtimeHub {
  private wss: WebSocketServer;
  private byKingdom = new Map<string, Set<WebSocket>>();
  private worldPending = false;
  connections = 0;

  constructor(server: Server, private pool: Db, private secret: string) {
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
    this.wss.on('connection', (ws, req) => void this.onConnection(ws, req));
    const ping = setInterval(() => {
      for (const ws of this.wss.clients) {
        const w = ws as WebSocket & { alive?: boolean };
        if (w.alive === false) { ws.terminate(); continue; }
        w.alive = false; ws.ping();
      }
    }, 30_000);
    ping.unref();
  }

  async listen() {
    const client = await this.pool.connect();
    (client as unknown as { on: (e: string, f: (m: { payload?: string }) => void) => void }).on('notification', msg => {
      try {
        const m = JSON.parse(msg.payload ?? '{}') as { k: string | null; type: string; data: unknown };
        if (m.k) this.push(m.k, { type: m.type, data: m.data });
        else this.broadcastWorld();
      } catch { /* e'tiborsiz */ }
    });
    await client.query(`LISTEN ${RT_CHANNEL}`);
  }

  private async onConnection(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://x');
    const claims = verifyToken(url.searchParams.get('token') ?? '', this.secret);
    if (!claims) { ws.close(4401, 'auth'); return; }
    const k = await one<{ id: string }>(this.pool, 'SELECT id FROM kingdoms WHERE user_id = $1', [claims.uid]);
    const key = k?.id ?? `user:${claims.uid}`;
    const set = this.byKingdom.get(key) ?? new Set();
    set.add(ws); this.byKingdom.set(key, set); this.connections++;
    (ws as WebSocket & { alive?: boolean }).alive = true;
    ws.on('pong', () => { (ws as WebSocket & { alive?: boolean }).alive = true; });
    ws.on('message', () => { /* klientdan buyruq qabul qilinmaydi */ });
    ws.on('close', () => { set.delete(ws); this.connections--; if (!set.size) this.byKingdom.delete(key); });
    ws.send(JSON.stringify({ type: 'hello' }));
  }

  push(kingdomId: string, msg: unknown) {
    const set = this.byKingdom.get(kingdomId);
    if (!set) return;
    const s = JSON.stringify(msg);
    for (const ws of set) if (ws.readyState === 1) ws.send(s);
  }

  /** Xarita o'zgarishlari 1 soniyada bir martadan ko'p yuborilmaydi (throttle). */
  broadcastWorld() {
    if (this.worldPending) return;
    this.worldPending = true;
    setTimeout(() => {
      this.worldPending = false;
      const s = JSON.stringify({ type: 'world_changed' });
      for (const ws of this.wss.clients) if (ws.readyState === 1) ws.send(s);
    }, 1000).unref();
  }

  close() { this.wss.close(); }
}
