// packages/game-rules/test/world.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_SIZE, ZONE_BOUNDS, cultureZone, marchDurationMs, terrainAt, weatherAt } from '../src/world.js';
import type { Culture, Terrain } from '../src/types.js';

test('W-01 terren deterministik va 5 turdan biri', () => {
  const ok: Terrain[] = ['tekislik', 'ormon', 'tog', 'chol', 'daryo'];
  for (let i = 0; i < 200; i++) {
    const x = (i * 37) % MAP_SIZE, y = (i * 91) % MAP_SIZE;
    assert.equal(terrainAt(x, y), terrainAt(x, y));
    assert.ok(ok.includes(terrainAt(x, y)));
  }
});
test('W-02 zona chegaralari o\'z millatiga tegishli', () => {
  for (const c of Object.keys(ZONE_BOUNDS) as Culture[]) {
    const b = ZONE_BOUNDS[c];
    assert.equal(cultureZone(b.x0, b.y0), c);
    assert.equal(cultureZone(b.x1, b.y1), c);
  }
});
test('W-03 Mo\'g\'ul otliqlari bir xil yo\'lni Rus piyodasidan tezroq bosib o\'tadi', () => {
  const m = marchDurationMs(['otliq'], 'mogul', 90, 50, 110, 70);
  const r = marchDurationMs(['piyoda'], 'rus', 90, 50, 110, 70);
  assert.ok(m < r / 2);
});
test('W-04 ob-havo 6 soat davomida o\'zgarmaydi', () => {
  const t = 6 * 3_600_000 * 1000;
  assert.equal(weatherAt(10, 10, t), weatherAt(10, 10, t + 5 * 3_600_000));
});
test('W-05 terren taqsimoti: har bir turdan kamida 2%', () => {
  const cnt: Record<string, number> = {};
  for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) cnt[terrainAt(x, y)] = (cnt[terrainAt(x, y)] ?? 0) + 1;
  for (const k of ['tekislik', 'ormon', 'tog', 'chol', 'daryo']) assert.ok((cnt[k] ?? 0) / (MAP_SIZE * MAP_SIZE) > 0.02, `${k}: ${cnt[k]}`);
});
