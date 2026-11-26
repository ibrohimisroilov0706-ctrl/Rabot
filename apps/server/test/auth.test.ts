// apps/server/test/auth.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InitDataError, signInitData, verifyInitData } from '../src/auth/telegram.js';
import { signToken, verifyToken } from '../src/auth/token.js';

const BOT = '987654:ABC-DEF';

test('AU-01 to\'g\'ri initData qabul qilinadi', () => {
  const u = verifyInitData(signInitData({ id: 42, first_name: 'Ali', username: 'ali' }, BOT), BOT, 3600);
  assert.equal(u.id, 42);
});
test('AU-02 boshqa bot tokeni bilan imzolangan initData rad etiladi', () => {
  assert.throws(() => verifyInitData(signInitData({ id: 42, first_name: 'Ali' }, 'other:token'), BOT, 3600), InitDataError);
});
test('AU-03 o\'zgartirilgan user maydoni rad etiladi', () => {
  const s = signInitData({ id: 42, first_name: 'Ali' }, BOT).replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
  assert.throws(() => verifyInitData(s, BOT, 3600), InitDataError);
});
test('AU-04 eskirgan initData rad etiladi', () => {
  const old = Math.floor(Date.now() / 1000) - 90_000;
  assert.throws(() => verifyInitData(signInitData({ id: 1, first_name: 'A' }, BOT, old), BOT, 86_400), /eskirgan/);
});
test('AU-05 JWT: imzo, muddat, soxtalashtirish', () => {
  const secret = 's'.repeat(40);
  const tok = signToken({ uid: 'u1', tg: 1 }, secret);
  assert.equal(verifyToken(tok, secret)?.uid, 'u1');
  assert.equal(verifyToken(tok, 'x'.repeat(40)), null);
  const [h, , s] = tok.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ uid: 'admin', tg: 1, exp: 9e9 })).toString('base64url')}.${s}`;
  assert.equal(verifyToken(forged, secret), null);
  assert.equal(verifyToken(signToken({ uid: 'u1', tg: 1 }, secret, -10), secret), null);
});
