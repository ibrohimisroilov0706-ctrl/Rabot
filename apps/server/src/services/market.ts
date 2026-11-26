// apps/server/src/services/market.ts
// NPC mintaqaviy bozor. Narx: p = clamp(p0 * e^(Q/V), 0.25p0, 4p0). Q 24 soatlik yarim-umr bilan so'nadi.
// Exploitdan himoya: bitim <= 5000 birlik, yig'im 5% (savdo shartnomasi bo'lsa 2%), audit log.

import {
  CULTURES, MARKET_BASE_PRICE, MARKET_FEE, MARKET_FEE_TRADE_PACT, marketPrice, type Culture, type ResourceKey,
} from '@qirolliklar/game-rules';
import type { Tx } from '../db.js';
import { many, one } from '../db.js';
import { conflict } from '../http/router.js';
import { capitalOf, syncCity } from './city.js';
import { audit, credit, gameMs, kingdomById, spend, type Game } from './common.js';

type Tradable = Exclude<ResourceKey, 'gold'>;
const DAY = 24 * 3_600_000;

async function decayedQ(t: Tx, g: Game, zone: Culture, r: Tradable, lock: boolean) {
  const row = await one<{ net_bought: number; updated_at: Date }>(t,
    `SELECT net_bought, updated_at FROM market_state WHERE zone = $1 AND resource = $2${lock ? ' FOR UPDATE' : ''}`, [zone, r]);
  if (!row) return 0;
  return row.net_bought * Math.exp(-gameMs(g, Date.now() - row.updated_at.getTime()) / DAY);
}

export async function prices(t: Tx, g: Game, zone: Culture) {
  const out: Record<string, number> = {};
  for (const r of Object.keys(MARKET_BASE_PRICE) as Tradable[]) out[r] = Math.round(marketPrice(MARKET_BASE_PRICE[r], await decayedQ(t, g, zone, r, false)) * 1000) / 1000;
  return out;
}

export async function trade(t: Tx, g: Game, me: string, input: { resource: Tradable; side: 'buy' | 'sell'; amount: number }, ip?: string) {
  const k = await kingdomById(t, me);
  const cityId = await capitalOf(t, me);
  await syncCity(t, g, cityId);
  const q = await decayedQ(t, g, k.culture, input.resource, true);
  const unit = marketPrice(MARKET_BASE_PRICE[input.resource], q);
  const pact = await one(t, "SELECT 1 FROM diplomacy WHERE type = 'savdo' AND state = 'faol' AND (from_kingdom_id = $1 OR to_kingdom_id = $1) LIMIT 1", [me]);
  const feeRate = pact ? MARKET_FEE_TRADE_PACT : MARKET_FEE;
  const gross = unit * input.amount;
  const tradeBonus = 1 + CULTURES[k.culture].bonuses.tradeIncome;
  let fee: number;
  if (input.side === 'buy') {
    fee = gross * feeRate;
    await spend(t, cityId, { gold: Math.ceil(gross + fee) });
    const got = await credit(t, cityId, { [input.resource]: input.amount });
    if ((got[input.resource] ?? 0) < input.amount) throw conflict('storage_full', 'Omborda joy yetmaydi');
  } else {
    fee = gross * feeRate;
    await spend(t, cityId, { [input.resource]: input.amount });
    await credit(t, cityId, { gold: Math.floor((gross - fee) * tradeBonus) });
  }
  await t.query('UPDATE market_state SET net_bought = $3, updated_at = now() WHERE zone = $1 AND resource = $2',
    [k.culture, input.resource, q + (input.side === 'buy' ? input.amount : -input.amount)]);
  await t.query(`INSERT INTO trade_orders (city_id, kingdom_id, resource, side, amount, unit_price, fee) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [cityId, me, input.resource, input.side, input.amount, unit, fee]);
  await audit(t, { kingdomId: me, action: 'trade', ip, details: { ...input, unit, fee } });
  return { unitPrice: unit, fee: Math.round(fee * 100) / 100 };
}

export async function history(t: Tx, me: string) {
  return many(t, 'SELECT resource, side, amount, unit_price, fee, created_at FROM trade_orders WHERE kingdom_id = $1 ORDER BY created_at DESC LIMIT 30', [me]);
}
