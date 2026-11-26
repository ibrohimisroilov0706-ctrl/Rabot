// apps/server/test/bot.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAY_TEXT, handleUpdate, isValidWebhook, registerBot } from '../src/telegram/bot.js';

const cfg = { token: '1:ABC', publicUrl: 'https://1-2-3-4.sslip.io', webhookSecret: 's3cret' };

test('BOT-01 /start ga Mini App tugmasi bilan javob', async () => {
  const calls: { url: string; body: any }[] = [];
  const out = await handleUpdate({ message: { chat: { id: 77 }, text: '/start' } }, cfg, async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; });
  assert.ok(out);
  assert.equal(calls[0]!.url, 'https://api.telegram.org/bot1:ABC/sendMessage');
  assert.equal(calls[0]!.body.chat_id, 77);
  assert.deepEqual(calls[0]!.body.reply_markup.inline_keyboard[0][0], { text: PLAY_TEXT, web_app: { url: cfg.publicUrl } });
});
test('BOT-02 boshqa xabarlarga javob yo\'q', async () => {
  assert.equal(await handleUpdate({ message: { chat: { id: 1 }, text: 'salom' } }, cfg, async () => ({ ok: true, status: 200 })), null);
  assert.equal(await handleUpdate({}, cfg, async () => ({ ok: true, status: 200 })), null);
});
test('BOT-03 webhook secret tekshiruvi', () => {
  assert.equal(isValidWebhook('s3cret', cfg), true);
  assert.equal(isValidWebhook('boshqa', cfg), false);
  assert.equal(isValidWebhook(undefined, cfg), false);
  assert.equal(isValidWebhook('', { ...cfg, webhookSecret: '' }), false);
});
test('BOT-04 ro\'yxatdan o\'tkazish: webhook + menyu tugmasi; https bo\'lmasa hech narsa qilmaydi', async () => {
  const urls: string[] = [];
  const f = async (url: string) => { urls.push(url.split('/').pop()!); return { ok: true, status: 200 }; };
  assert.equal(await registerBot(cfg, f), true);
  assert.deepEqual(urls, ['setWebhook', 'setChatMenuButton', 'setMyCommands']);
  assert.equal(await registerBot({ ...cfg, publicUrl: 'http://localhost:8080' }, f), false);
});
