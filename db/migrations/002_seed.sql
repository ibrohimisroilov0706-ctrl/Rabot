-- db/migrations/002_seed.sql
-- Boshlang'ich ma'lumotlar: 128x128 prototip xaritasi uchun 16x16 = 256 viloyat, bozor holati,
-- va World Engine'ning global soatlik vazifasi.

INSERT INTO territories (id, rx, ry)
SELECT ry * 16 + rx, rx, ry
FROM generate_series(0, 15) AS rx, generate_series(0, 15) AS ry
ON CONFLICT DO NOTHING;

INSERT INTO market_state (zone, resource)
SELECT z::culture, r
FROM unnest(ARRAY['rus','ingliz','usmonli','temuriy','mogul']) AS z,
     unnest(ARRAY['food','wood','stone','iron','horses']) AS r
ON CONFLICT DO NOTHING;

-- Soatlik global vazifa: xizmat maoshlari, iqtisodiy tarqalish, qo'zg'olon tekshiruvi.
-- Har bajarilganda o'zi keyingi soatga qayta rejalashtiriladi (dedupe_key bilan faqat bitta nusxa).
INSERT INTO game_events (type, due_at, payload, dedupe_key)
VALUES ('hourly_tick', now() + interval '1 minute', '{}'::jsonb, 'hourly_tick')
ON CONFLICT DO NOTHING;
