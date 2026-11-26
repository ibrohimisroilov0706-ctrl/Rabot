// apps/server/src/telegram/bot.ts
// Telegram bot webhook: /start ga "O'ynash" tugmasi (Mini App) bilan javob beradi.
// Xavfsizlik: Telegram har so'rovda X-Telegram-Bot-Api-Secret-Token yuboradi; u TELEGRAM_WEBHOOK_SECRET ga teng bo'lishi shart.

export interface BotConfig { token: string; publicUrl: string; webhookSecret: string }
type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export const PLAY_TEXT = '⚔️ O‘ynash';
export const WELCOME =
  'QIROLLIKLAR: Imperiyalar Taqdiri\n\n' +
  'O‘z shahringizning qiroli bo‘ling: quring, qo‘shin yig‘ing, ittifoq tuzing va imperiya barpo eting. ' +
  'Dunyo siz oflayn bo‘lganingizda ham yashaydi.\n\nBoshlash uchun pastdagi tugmani bosing.';

export function isValidWebhook(headerSecret: string | undefined, cfg: BotConfig): boolean {
  return !!cfg.webhookSecret && headerSecret === cfg.webhookSecret;
}

/** Bitta update ni qayta ishlaydi. Qaytaradi: yuborilgan javob (test uchun) yoki null. */
export async function handleUpdate(update: any, cfg: BotConfig, fetchFn: FetchFn = fetch as unknown as FetchFn) {
  const msg = update?.message;
  const text: string | undefined = msg?.text;
  const chatId = msg?.chat?.id;
  if (!chatId || typeof text !== 'string') return null;
  if (!/^\/(start|play|oyna)/i.test(text.trim())) return null;
  const body = {
    chat_id: chatId,
    text: WELCOME,
    reply_markup: { inline_keyboard: [[{ text: PLAY_TEXT, web_app: { url: cfg.publicUrl } }]] },
  };
  const r = await fetchFn(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) console.warn('[bot] sendMessage xato', r.status);
  return body;
}

/** Server ishga tushganda: webhook va menyu tugmasini o'rnatadi (PUBLIC_URL berilgan bo'lsa). */
export async function registerBot(cfg: BotConfig, fetchFn: FetchFn = fetch as unknown as FetchFn) {
  if (!cfg.token || !cfg.publicUrl.startsWith('https://')) return false;
  const call = (method: string, payload: unknown) => fetchFn(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const base = cfg.publicUrl.replace(/\/$/, '');
  const a = await call('setWebhook', { url: `${base}/telegram/webhook`, secret_token: cfg.webhookSecret, allowed_updates: ['message'], drop_pending_updates: true });
  const b = await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'O‘ynash', web_app: { url: base } } });
  await call('setMyCommands', { commands: [{ command: 'start', description: 'O‘yinni boshlash' }] });
  console.log(`[bot] webhook ${a.ok ? 'o‘rnatildi' : 'XATO ' + a.status}, menyu tugmasi ${b.ok ? 'o‘rnatildi' : 'XATO ' + b.status}`);
  return a.ok && b.ok;
}
