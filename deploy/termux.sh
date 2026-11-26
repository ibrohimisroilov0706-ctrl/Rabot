#!/usr/bin/env bash
# deploy/termux.sh — o'yinni Android telefonda (Termux) vaqtincha ishga tushirish.
# Ishlatish (Termux ichida):  bash deploy/termux.sh
# Nima qiladi: paketlar -> PostgreSQL -> npm install va build -> maxfiy kalitlar (.env.local, telefonda qoladi)
#              -> Cloudflare bepul HTTPS tunnel -> server (bot webhook va "O'ynash" tugmasi avtomatik ulanadi).
# Eslatma: telefon yoqiq, internetda va Termux ochiq bo'lishi kerak. Har ishga tushirishda HTTPS manzil yangilanadi,
#          server uni botga o'zi qayta ulaydi.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PGDATA="${PGDATA:-${PREFIX:-/usr}/var/lib/postgresql}"
ENVF="$ROOT/.env.local"
TUNNEL_LOG="$ROOT/tunnel.log"
log() { echo -e "\033[1;33m[qirolliklar]\033[0m $*"; }
die() { echo -e "\033[1;31m[qirolliklar] XATO:\033[0m $*" >&2; exit 1; }

# --- 1. Paketlar
need=()
command -v node >/dev/null 2>&1 || need+=(nodejs-lts)
command -v pg_ctl >/dev/null 2>&1 || need+=(postgresql)
command -v cloudflared >/dev/null 2>&1 || need+=(cloudflared)
if [ ${#need[@]} -gt 0 ]; then
  log "O'rnatilmoqda: ${need[*]}"
  pkg update -y && pkg install -y "${need[@]}"
fi

# --- 2. PostgreSQL
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  log "Baza yaratilmoqda..."
  mkdir -p "$PGDATA" && initdb "$PGDATA" >/dev/null
fi
pg_ctl -D "$PGDATA" status >/dev/null 2>&1 || pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" start >/dev/null
for _ in $(seq 1 20); do psql -h 127.0.0.1 -d postgres -tAc "select 1" >/dev/null 2>&1 && break; sleep 1; done
psql -h 127.0.0.1 -d postgres -tAc "select 1 from pg_database where datname='qirolliklar'" | grep -q 1 \
  || createdb -h 127.0.0.1 qirolliklar
log "PostgreSQL ishlayapti"

# --- 3. Kutubxonalar va klient build (faqat birinchi marta yoki yangilanganda)
if [ ! -d node_modules ]; then log "npm install (birinchi marta 3-10 daqiqa)..."; npm install --no-audit --no-fund; fi
if [ ! -f apps/client/dist/index.html ] || [ -n "$(find apps/client/src packages/game-rules/src -newer apps/client/dist/index.html -print -quit 2>/dev/null)" ]; then
  log "Klient build qilinmoqda..."; npm run build -w @qirolliklar/client
fi

# --- 4. Maxfiy kalitlar (.env.local — faqat telefonda, git'ga tushmaydi)
touch "$ENVF" && chmod 600 "$ENVF"
get_env() { grep -E "^$1=" "$ENVF" | tail -1 | cut -d= -f2- || true; }
set_env() { if grep -qE "^$1=" "$ENVF"; then sed -i "s|^$1=.*|$1=$2|" "$ENVF"; else echo "$1=$2" >> "$ENVF"; fi; }
rand() { node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }
TOKEN="$(get_env TELEGRAM_BOT_TOKEN)"
if [ -z "$TOKEN" ]; then
  read -rsp "Bot tokenini kiriting (@BotFather): " TOKEN; echo
fi
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || die "Token formati noto'g'ri. .env.local faylidagi TELEGRAM_BOT_TOKEN ni tekshiring"
set_env TELEGRAM_BOT_TOKEN "$TOKEN"
[ -n "$(get_env JWT_SECRET)" ] || set_env JWT_SECRET "$(rand 32)"
[ -n "$(get_env TELEGRAM_WEBHOOK_SECRET)" ] || set_env TELEGRAM_WEBHOOK_SECRET "$(rand 24)"
[ -n "$(get_env GAME_SPEED)" ] || set_env GAME_SPEED 1

# --- 5. HTTPS tunnel (Cloudflare, bepul, ro'yxatdan o'tish shart emas)
pkill -f "cloudflared tunnel" 2>/dev/null || true
: > "$TUNNEL_LOG"
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080 > "$TUNNEL_LOG" 2>&1 &
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$URL" ] && break; sleep 1
done
[ -n "$URL" ] || { tail -20 "$TUNNEL_LOG"; die "Tunnel manzili olinmadi (internetni tekshiring)"; }
log "HTTPS manzil: $URL"

# --- 6. Server
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true   # ekran o'chsa ham ishlasin
set -a; . "$ENVF"; set +a
export NODE_ENV=production DATABASE_URL="postgres://$(whoami)@127.0.0.1:5432/qirolliklar" PORT=8080 \
  PUBLIC_URL="$URL" CORS_ORIGIN="$URL" TRUST_PROXY=true DEV_AUTH=false STATIC_DIR="$ROOT/apps/client/dist" \
  DB_POOL_SIZE=5
log "Server ishga tushmoqda. Telegramda botni oching -> /start -> O'ynash"
log "To'xtatish: Ctrl+C. Qayta ishga tushirish: bash deploy/termux.sh"
[ "${SKIP_SERVER:-0}" = "1" ] && exit 0
exec npx tsx apps/server/src/index.ts
