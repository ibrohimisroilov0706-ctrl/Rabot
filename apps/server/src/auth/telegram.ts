// apps/server/src/auth/telegram.ts
// Telegram Mini App initData tekshiruvi (rasmiy algoritm):
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   data_check_string = hash dan boshqa barcha maydonlar, kalit bo'yicha saralangan, "key=value" \n bilan
//   hash == hex(HMAC_SHA256(key = secret_key, data = data_check_string))
// Kirish: initData qatori. Chiqish: TelegramUser yoki xato.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export class InitDataError extends Error {}

export function verifyInitData(initData: string, botToken: string, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): TelegramUser {
  if (!botToken) throw new InitDataError('Bot token sozlanmagan');
  if (!initData || initData.length > 4096) throw new InitDataError('initData yo\'q yoki juda uzun');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError('hash noto\'g\'ri');
  params.delete('hash');
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new InitDataError('Imzo mos emas');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec || authDate - nowSec > 60) throw new InitDataError('initData eskirgan');
  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('user maydoni yo\'q');
  const user = JSON.parse(userRaw) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new InitDataError('user.id noto\'g\'ri');
  return user;
}

/** Testlar va lokal ishlab chiqish uchun: haqiqiy imzoli initData yasaydi. */
export function signInitData(user: TelegramUser, botToken: string, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAE-test', user: JSON.stringify(user) });
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}
