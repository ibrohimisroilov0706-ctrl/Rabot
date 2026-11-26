# QIROLLIKLAR: Imperiyalar Taqdiri

Telegram Mini App uchun 2D multiplayer strategiya. Bitta umumiy dunyo, beshta millat (Ruslar, Inglizlar, Usmonli turklar, Temuriy turklar, Mo‘g‘ullar). Har bir o‘yinchi o‘z shahrining qiroli. Dunyo o‘yinchi oflayn bo‘lganda ham yashayveradi.

To‘liq dizayn hujjatlari (GDD, formulalar, millatlar, balans, jang) alohida hujjatda. Bu repozitoriy ularning ishlaydigan kodi.

## Nima tayyor

| Qism | Holat |
| --- | --- |
| Shahar: 19 bino, 1–10 daraja, navbat, bekor qilish (80% qaytadi), soliq, aholi, baxt | ✅ |
| Iqtisodiyot: 6 resurs, ombor sig‘imi, lazy simulyatsiya, NPC bozor (dinamik narx, yig‘im) | ✅ |
| Armiya: 6 sinf + har millatda 2 maxsus birlik, yollash navbati, generallar, tajriba | ✅ |
| Yurish va jang: terren, ob-havo, devor, minora, qamal, o‘lja, 48 soatlik qalqon, jang tarixi | ✅ |
| Xizmat shartnomalari: yollanma, mustaqil ittifoqchi, vassal (o‘lpon), buyruq darajasi, maosh | ✅ |
| Milliyat va sadoqat: R1–R7 qoidalari, 12 soatlik mustaqillik oynasi, "Saxiylik" | ✅ |
| Diplomatiya: ittifoq, savdo, tinchlik, urush e’loni, nikoh, ishonch, xiyonat | ✅ |
| Suiqasd (faqat mehmon qirolga), agentlar, vorislik, regentlik, fuqarolar urushi | ✅ |
| World Engine: markaziy hodisalar navbati, soatlik/kunlik vazifalar, ko‘p nusxada xavfsiz | ✅ |
| Telegram initData HMAC auth, JWT, rate limit, audit log, server-authoritative | ✅ |
| Realtime: WebSocket + PostgreSQL LISTEN/NOTIFY | ✅ |
| Klient: Phaser 3 xarita va izometrik shahar, o‘zbekcha UI, 11 ekran, mobil | ✅ |
| Docker, Caddy (avtomatik HTTPS), kunlik backup, GitHub Actions CI + avtomatik deploy, k6 load test | ✅ |
| Telegram bot: webhook, `/start` → “O‘ynash” tugmasi, menyu tugmasi avtomatik o‘rnatiladi | ✅ |
| Tadqiqot daraxti (akademiya), o‘yinchilar orasidagi buyurtma kitobi, karvonlar, viloyat egallash | 2-bosqich |

## Tuzilma

```
qirolliklar/
├── packages/game-rules/     # Sof o'yin qoidalari va formulalar (server ham, klient ham ishlatadi)
│   ├── src/                 # economy, battle, loyalty, intrigue, cultures, units, world, rng
│   └── test/                # 49 ta test
├── apps/server/             # Node.js + TypeScript API, World Engine, realtime
│   ├── src/
│   │   ├── auth/            # Telegram initData HMAC, JWT
│   │   ├── http/            # router, rate limit
│   │   ├── services/        # city, construction, army, battle, service, diplomacy, intrigue, market, kingdom
│   │   ├── engine/          # World Engine (game_events navbati)
│   │   └── realtime/        # WebSocket hub
│   └── test/                # auth (5), bot (4), integratsiya (13, haqiqiy PostgreSQL bilan)
├── apps/client/             # Phaser 3 + TypeScript + Vite, Telegram Mini App
│   └── src/{art,scenes,screens}
├── db/migrations/           # 001_init.sql (24 jadval), 002_seed.sql
├── loadtest/k6.js           # 10 000 CCU yuklama testi
├── deploy/                  # server-deploy.sh (avtomatik sozlash), Caddyfile (HTTPS)
├── Dockerfile, docker-compose.yml, .github/workflows/ci.yml (test + deploy)
```

## Ishga tushirish: GitHub'ga push → o'yin ishlaydi

Bir marta sozlanadi, keyin har `git push` da o'zi yangilanadi.

**1. Bot.** [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni saqlang. Token hech qachon kodga yoki ochiq joyga yozilmaydi.

**2. Server.** Istalgan VPS: Ubuntu 22.04/24.04, kamida 2 GB RAM, root paroli yoki SSH kaliti. 80 va 443 portlar ochiq bo'lsin. Domen shart emas: u bo'lmasa, `203-0-113-7.sslip.io` ko'rinishidagi bepul HTTPS manzil avtomatik olinadi.

**3. GitHub Secrets.** Repo → Settings → Secrets and variables → Actions → *New repository secret*:

| Nomi | Qiymati |
| --- | --- |
| `SSH_HOST` | Server IP manzili |
| `SSH_PASSWORD` | Server root paroli (yoki `SSH_PRIVATE_KEY`) |
| `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
| `DOMAIN` *(ixtiyoriy)* | O'z domeningiz, A-yozuvi server IP ga qaragan bo'lsin |
| `SSH_USER`, `SSH_PORT` *(ixtiyoriy)* | Standart: `root`, `22` |

**4. Push.** `git push origin main` qiling yoki Actions → "CI va Deploy" → *Run workflow* tugmasini bosing. GitHub quyidagilarni o'zi bajaradi:
- testlarni ishga tushiradi;
- kodni serverga ko'chiradi;
- Docker'ni o'rnatadi;
- maxfiy kalitlarni yaratadi (ular serverda qoladi);
- HTTPS sertifikatini oladi;
- o'yinni ishga tushiradi;
- botga "O'ynash" tugmasini ulaydi.

Birinchi deploy 5–8 daqiqa davom etadi. Oxirgi qadam logida o'yin manzili chiqadi.

**5. O'ynash.** Telegramda botni oching → `/start` → **⚔️ O'ynash**.

**Muammo bo'lsa:**
- Actions logini ko'ring.
- Serverda ilova logi: `cd /opt/qirolliklar && docker compose logs -f app`.
- HTTPS sertifikati logi: `docker compose logs caddy`. sslip.io bilan sertifikat olinmasa, o'z domeningizni `DOMAIN` secret'iga qo'shing.

Qo'lda (GitHub'siz): serverda `TELEGRAM_BOT_TOKEN=... bash deploy/server-deploy.sh`.

## Lokal ishlab chiqish

Kerak: Node.js 20+ va PostgreSQL 14+ (yoki faqat bazani Docker orqali ishga tushiring).

```bash
npm install
cp .env.example .env
# .env: NODE_ENV=development, DEV_AUTH=true, GAME_SPEED=10, DATABASE_URL=...localhost...
docker compose up -d db          # faqat baza
npm run dev:server               # http://localhost:8080 (API + World Engine)
npm run dev:client               # http://localhost:5173 (Vite, /api va /ws ni 8080 ga proksi qiladi)
```

Brauzerda `http://localhost:5173` ni oching: DEV_AUTH yoqilgan bo‘lsa, Telegramsiz kirasiz.

## Telegram bot va Mini App

1. [@BotFather](https://t.me/BotFather) da `/newbot` bilan bot yarating va tokenni `.env` dagi `TELEGRAM_BOT_TOKEN` ga yozing.
2. Mini App HTTPS talab qiladi. Variantlar:
   - VPS + domen + Cloudflare (proxy yoqilgan) → `https://o-yin.sizning-domen.uz`.
   - Lokal sinov: `cloudflared tunnel --url http://localhost:8080` bergan `https://...trycloudflare.com` manzili.
3. BotFather → `/mybots` → botingiz → **Bot Settings → Menu Button** (yoki `/newapp`) → URL ga HTTPS manzilni kiriting.
4. Telegramda botni ochib, menyu tugmasini bosing. Server `initData` imzosini bot tokeni bilan tekshiradi (`apps/server/src/auth/telegram.ts`).

## Sozlamalar (.env)

| O‘zgaruvchi | Ma’nosi | Standart |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL ulanishi | — (majburiy) |
| `JWT_SECRET` | Sessiya imzosi, kamida 32 belgi | — (majburiy) |
| `TELEGRAM_BOT_TOKEN` | initData tekshiruvi uchun | productionda majburiy |
| `GAME_SPEED` | Vaqt tezligi (10 = hammasi 10x tez) | 1 |
| `SHIELD_HOURS` | Yangi o‘yinchi qalqoni | 72 |
| `DEV_AUTH` | Telegramsiz kirish (productionda taqiqlangan) | false |
| `API_ENABLED` / `ENGINE_ENABLED` | Jarayon rollarini ajratish | true / true |
| `CORS_ORIGIN` | Ruxsat etilgan domenlar | `*` |
| `TRUST_PROXY` | Cloudflare/nginx ortida haqiqiy IP | false |
| `STATIC_DIR` | Klient build papkasi (Docker’da avtomatik) | — |

## Testlar

```bash
npm test -w @qirolliklar/game-rules                                    # 49 ta qoida testi
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/qirolliklar_test \
  npm test -w @qirolliklar/server                                     # auth + 12 integratsiya testi
npm run typecheck
```

Integratsiya testi bo‘sh bazani har safar tozalab, uchta o‘yinchi bilan to‘liq siklni o‘tkazadi:
- Telegram imzosi: to‘g‘ri, soxta va eskirgan.
- Qurilish qoidalari: navbat, saroy chegarasi, resurs yetmasligi.
- Yollash, bozor va hujum. Saqlangan jangni qayta hisoblab, natija bir xil chiqishi tekshiriladi.
- Yollanma qo‘shin: egalik o‘zgarmasligi, buyruq huquqi, 3 jangdan keyin sadoqat qoidasi, maosh.
- Tinchlik shartnomasi va suiqasd (faqat mehmon qirolga).
- Validatsiya va World Engine'da muvaffaqiyatsiz hodisa qolmagani.

## API

Barcha so‘rovlar `Authorization: Bearer <token>` bilan (auth’dan tashqari). Javob JSON. Xato: `{ error, message, details }`.

| Metod | Yo‘l | Vazifa |
| --- | --- | --- |
| POST | `/api/auth/telegram` | `{ initData }` → `{ token }` |
| POST | `/api/auth/dev` | Faqat DEV_AUTH: `{ telegramId, name }` |
| GET | `/api/config` | Xarita o‘lchami, o‘yin tezligi |
| GET | `/api/me` | Butun holat: qirollik, shahar (simulyatsiya qilingan), navbat, armiyalar, shartnomalar, saroy |
| POST | `/api/kingdom` | `{ name, culture, cityName, rulerName? }` |
| POST | `/api/city/build` | `{ key }` yangi bino yoki `{ buildingId }` yaxshilash |
| POST | `/api/city/cancel` | `{ queueId }` |
| POST | `/api/city/tax` | `{ taxPct }` 0–40 |
| POST | `/api/army/recruit` | `{ unitKey, count }` |
| POST | `/api/army/march` | `{ targetCityId, units, commanderId? }` yoki xizmatdagi qo‘shin uchun `{ targetCityId, armyId }` |
| GET | `/api/world?x0&y0&x1&y1` | Shaharlar va yo‘ldagi qo‘shinlar |
| GET | `/api/kingdoms?q=` , `/api/kingdoms/:id` | Reyting va qirollik ma’lumoti (ishonch bilan) |
| POST | `/api/service/offer` | `{ hostKingdomId, status, units, payPerHour, hours, commandLevel, tributePct }` |
| POST | `/api/service/:id/accept`, `reject`, `leave`, `generosity` | Shartnoma amallari |
| GET/POST | `/api/diplomacy`, `/api/diplomacy/propose`, `/:id/accept`, `reject`, `break` | Shartnomalar va ishonch |
| POST | `/api/king/visit`, `/api/king/home` | Qirolning mehmonligi |
| POST | `/api/intrigue/agents`, `/api/intrigue/assassinate` | Agent va suiqasd |
| GET/POST | `/api/market`, `/api/market/trade` | Narxlar, `{ resource, side, amount }` |
| GET | `/api/battles`, `/api/notifications`; POST `/api/notifications/read` | Tarix va xabarlar |
| POST | `/telegram/webhook` | Bot: `/start` ga “O‘ynash” tugmasi (secret header bilan himoyalangan) |
| GET | `/healthz`, `/metrics` | Monitoring (Prometheus formati) |
| WS | `/ws?token=` | Faqat signal: `notification`, `city_changed`, `army_changed`, `world_changed` |

## Arxitektura qisqacha

- **Server-authoritative.** Klient faqat niyat yuboradi. Narx, vaqt, jang, sadoqat — hammasi serverda, `game-rules` paketidagi sof funksiyalar bilan.
- **Lazy simulyatsiya.** Har shaharda `last_simulated_at` bor. Shahar o‘qilganda o‘tgan vaqt 15 daqiqalik qadamlar bilan hisoblanadi. Taymerlar yo‘q.
- **World Engine.** `game_events` jadvali `due_at` indeksi bilan. `FOR UPDATE SKIP LOCKED` tufayli bir nechta engine nusxasi xavfsiz ishlaydi. Har hodisa o‘z tranzaksiyasida bajariladi.
- **Determinizm.** Jang va sadoqat tasodifi seed’dan olinadi. Jangning to‘liq kirish ma’lumoti `battles.input` da saqlanadi, natijani istalgan payt qayta tekshirish mumkin.
- **Realtime.** `pg_notify` faqat tranzaksiya commit bo‘lgandan keyin yetkaziladi, shuning uchun klient hech qachon hali saqlanmagan holatni ko‘rmaydi.

## Masshtablash (10 000 o‘yinchi)

1. API va engine’ni ajrating: N ta `API_ENABLED=true ENGINE_ENABLED=false` va 1–2 ta `API_ENABLED=false ENGINE_ENABLED=true`. Ular orasida Cloudflare yoki nginx load balancer turadi (WebSocket uchun sticky shart emas).
2. PostgreSQL: PgBouncer (transaction mode), `DB_POOL_SIZE` ni nusxalarga bo‘ling, o‘qish uchun replika.
3. Rate limit hozir har jarayonning o‘z xotirasida. Ko‘p nusxada uni Redis’ga ko‘chiring (`apps/server/src/http/rateLimit.ts` — bitta sinf).
4. Yuklama testini staging’da o‘tkazing (`DEV_AUTH=true`, alohida baza): `k6 run -e BASE=https://staging... -e VUS=10000 loadtest/k6.js`. Maqsad: p95 < 300 ms, xato < 0.5%, `/metrics` dagi `qrl_engine_lag_ms` < 2000.

10 000 CCU testsiz kafolatlanmaydi (D-20). Avval 1 000, keyin 5 000, keyin 10 000.

## Design Decisions (koddagi qarorlar)

| ID | Qaror | Sabab |
| --- | --- | --- |
| D-12a | Realtime uchun Colyseus emas, `ws` + PostgreSQL NOTIFY | Jang va yurish serverda bir martalik hisoblanadi, xona holatini sinxronlash kerak emas. Real vaqtli taktik rejim qo‘shilsa, Colyseus `RealtimeHub` interfeysi ortiga ulanadi |
| D-22 | Redis prototipda ishlatilmaydi | Bitta jarayonda kerak emas. Masshtablashda rate limit va keshlash uchun qo‘shiladi |
| D-23 | Xarita prototipda 128×128 (256 viloyat) | `packages/game-rules/src/world.ts` dagi `MAP_SIZE`. Prod: 512 |
| D-24 | Shahar egallanmaydi, talanadi (20% resurs, yuk sig‘imigacha) va 48 soat qalqon oladi | O‘yinchi hech qachon hamma narsasini yo‘qotmaydi |
| D-25 | Qo‘shin qirilsa xizmat shartnomasi yopiladi, lekin tarixi saqlanadi | `army_service.army_id` → `ON DELETE SET NULL` |
| D-26 | Boshlang‘ich shahar: aholi 400, soliq 15%, garnizon 60 piyoda + 30 kamonchi + 20 nayzachi | Oltin balansi +27/soat bilan boshlanadi |
| D-27 | Buyurtma kitobi o‘rniga hozircha faqat NPC bozor | Exploitlardan himoya sodda; `trade_orders` jadvali kelajakdagi kitobga tayyor |

## Litsenziya

Loyiha egasi tanlaydi.
