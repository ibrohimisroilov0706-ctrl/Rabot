#!/usr/bin/env bash
# deploy/server-deploy.sh — serverda ishlaydi (GitHub Actions SSH orqali chaqiradi, yoki qo'lda: sudo bash deploy/server-deploy.sh)
# Vazifasi: Docker o'rnatish (bo'lmasa), .env yaratish/yangilash, maxfiy kalitlarni bir marta generatsiya qilish,
# HTTPS domenini aniqlash, docker compose up, sog'liqni tekshirish.
# Kirish (muhit o'zgaruvchilari): TELEGRAM_BOT_TOKEN (majburiy), DOMAIN (ixtiyoriy), HOST_IP (ixtiyoriy), DRY_RUN=1 (test uchun)
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"
log() { echo -e "\033[1;33m[deploy]\033[0m $*"; }
die() { echo -e "\033[1;31m[deploy] XATO:\033[0m $*" >&2; exit 1; }

[ -n "${TELEGRAM_BOT_TOKEN:-}" ] || die "TELEGRAM_BOT_TOKEN berilmagan (GitHub Secrets ga qo'shing)"
[[ "$TELEGRAM_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || die "TELEGRAM_BOT_TOKEN formati noto'g'ri"

# --- 1. Docker
if [ "${DRY_RUN:-0}" != "1" ] && ! command -v docker >/dev/null 2>&1; then
  log "Docker o'rnatilmoqda..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# --- 2. Domen: berilmagan bo'lsa IP dan bepul sslip.io domeni (masalan 1-2-3-4.sslip.io)
if [ -z "${DOMAIN:-}" ]; then
  IP="${HOST_IP:-}"
  [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || IP="$(curl -fsS4 --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
  [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Server IP sini aniqlab bo'lmadi, DOMAIN secret ini bering"
  DOMAIN="${IP//./-}.sslip.io"
fi
log "Domen: https://$DOMAIN"

# --- 3. .env (maxfiy kalitlar faqat bir marta yaratiladi va serverda qoladi)
touch .env && chmod 600 .env
get_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
set_env() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
gen() { openssl rand -hex "$1"; }
PGPASS="$(get_env POSTGRES_PASSWORD)"; [ -n "$PGPASS" ] || PGPASS="$(gen 24)"
JWT="$(get_env JWT_SECRET)"; [ -n "$JWT" ] || JWT="$(gen 32)"
WHS="$(get_env TELEGRAM_WEBHOOK_SECRET)"; [ -n "$WHS" ] || WHS="$(gen 24)"
set_env NODE_ENV production
set_env POSTGRES_PASSWORD "$PGPASS"
set_env JWT_SECRET "$JWT"
set_env TELEGRAM_WEBHOOK_SECRET "$WHS"
set_env TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
set_env DOMAIN "$DOMAIN"
set_env PUBLIC_URL "https://$DOMAIN"
set_env CORS_ORIGIN "https://$DOMAIN"
set_env TRUST_PROXY true
set_env DEV_AUTH false
[ -n "$(get_env GAME_SPEED)" ] || set_env GAME_SPEED "${GAME_SPEED:-1}"
[ -n "$(get_env SHIELD_HOURS)" ] || set_env SHIELD_HOURS 72
log ".env tayyor (maxfiy kalitlar: $(grep -c . .env) qator)"

if [ "${DRY_RUN:-0}" = "1" ]; then log "DRY_RUN: docker qadamlari o'tkazib yuborildi"; exit 0; fi

# --- 4. Firewall (ufw yoqilgan bo'lsa)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

# --- 5. Ishga tushirish
log "Build va ishga tushirish (birinchi marta 3-6 daqiqa)..."
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null || true

# --- 6. Sog'liq tekshiruvi
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
    log "Server ishlayapti ✅  O'yin: https://$DOMAIN"
    log "Telegramda botingizni oching va /start bosing."
    exit 0
  fi
  sleep 3
done
docker compose logs --tail=80 app
die "Server 3 daqiqada javob bermadi (yuqoridagi loglarni ko'ring)"
