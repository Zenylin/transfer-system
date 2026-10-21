#!/usr/bin/env bash
# 一鍵啟動：Medical 後端 (HTTPS) + Angular + Gateway + ngrok
set -euo pipefail

ROOT="${ROOT:-$HOME/medical-system}"
ROOT_FRONTEND="${ROOT_FRONTEND:-$ROOT/frontend}"
ROOT_BACKEND="${ROOT_BACKEND:-$ROOT/backend}"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"
GATEWAY_PORT="${GATEWAY_PORT:-8091}"
LAN_IP="${LAN_IP:-172.16.50.2}"

LOG_DIR="${LOG_DIR:-$ROOT/log}"
PID_DIR="${PID_DIR:-/tmp/medical_stack/pids}"
mkdir -p "$LOG_DIR" "$PID_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${CYAN}▶${NC} $*"; }
ok() { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err() { echo -e "${RED}✖${NC} $*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "找不到指令：$1"
    exit 1
  }
}

port_in_use() {
  ss -tln 2>/dev/null | grep -qE ":$1\\b"
}

wait_port() {
  local port="$1" name="$2" retries="${3:-60}"
  for ((i = 1; i <= retries; i++)); do
    if port_in_use "$port"; then
      ok "$name 已在 port $port 就緒"
      return 0
    fi
    sleep 1
  done
  err "$name 在 ${retries}s 內沒有聽到 port $port，請看 log：$LOG_DIR"
  return 1
}

kill_pidfile() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$file"
  fi
}

stop_stack() {
  info "停止舊行程..."
  kill_pidfile "$PID_DIR/ngrok.pid"
  kill_pidfile "$PID_DIR/gateway.pid"
  kill_pidfile "$PID_DIR/frontend.pid"
  kill_pidfile "$PID_DIR/backend.pid"
  for port in "$GATEWAY_PORT" "$FRONTEND_PORT" "$BACKEND_PORT"; do
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    fi
  done
  pkill -f "ngrok http .*${GATEWAY_PORT}" >/dev/null 2>&1 || true
}

fetch_ngrok_url() {
  local retries=40
  local gp="$GATEWAY_PORT"
  for ((i = 1; i <= retries; i++)); do
    if curl -fsS "http://127.0.0.1:4040/api/tunnels" >/tmp/medical_ngrok_tunnels.json 2>/dev/null; then
      local url
      url="$(GATEWAY_PORT="$gp" python3 - <<'PY'
import json, os
gp = os.environ.get("GATEWAY_PORT", "8091")
data = json.load(open("/tmp/medical_ngrok_tunnels.json"))
matched = []
for t in data.get("tunnels") or []:
    addr = str((t.get("config") or {}).get("addr") or "")
    pub = str(t.get("public_url") or "")
    if addr.rstrip("/").endswith(":" + gp) and pub:
        matched.append(pub)
https = [u for u in matched if u.startswith("https://")]
http = [u for u in matched if u.startswith("http://")]
print((https or http or [""])[0])
PY
)"
      if [[ -n "$url" ]]; then
        echo "$url"
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

if [[ "${1:-}" == "stop" ]]; then
  stop_stack
  ok "已停止"
  exit 0
fi

need_cmd ss
need_cmd curl
need_cmd python3
need_cmd node
need_cmd npm
need_cmd ngrok
need_cmd mongo

[[ -d "$ROOT_BACKEND" ]] || {
  err "找不到後端目錄：$ROOT_BACKEND"
  exit 1
}
[[ -d "$ROOT_FRONTEND" ]] || {
  err "找不到前端目錄：$ROOT_FRONTEND"
  exit 1
}
[[ -f "$ROOT_FRONTEND/scripts/gateway.mjs" ]] || {
  err "找不到 Gateway：$ROOT_FRONTEND/scripts/gateway.mjs"
  exit 1
}

if ! mongo --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
  err "MongoDB 無法連線（預期 localhost:27017）。請先啟動 mongod。"
  exit 1
fi
ok "MongoDB 可用"

if ! ngrok config check >/dev/null 2>&1; then
  warn "ngrok 設定可能不完整。若等下失敗，請先執行："
  echo "  ngrok config add-authtoken <你的token>"
fi

stop_stack

echo
info "1/4 啟動後端 HTTPS (port $BACKEND_PORT)"
(
  cd "$ROOT_BACKEND"
  nohup npm run dev >"$LOG_DIR/backend.log" 2>&1 &
  echo $! >"$PID_DIR/backend.pid"
)
wait_port "$BACKEND_PORT" "後端"

echo
info "2/4 啟動 Angular (port $FRONTEND_PORT, path /transfer/)"
(
  cd "$ROOT_FRONTEND"
  nohup npm start -- --host 0.0.0.0 --port "$FRONTEND_PORT" \
    >"$LOG_DIR/frontend.log" 2>&1 &
  echo $! >"$PID_DIR/frontend.pid"
)
wait_port "$FRONTEND_PORT" "Angular" 180

echo
info "3/4 啟動 Gateway (port $GATEWAY_PORT)"
(
  cd "$ROOT_FRONTEND"
  BACKEND_PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" GATEWAY_PORT="$GATEWAY_PORT" \
    BACKEND_HTTPS=1 \
    nohup node scripts/gateway.mjs >"$LOG_DIR/gateway.log" 2>&1 &
  echo $! >"$PID_DIR/gateway.pid"
)
wait_port "$GATEWAY_PORT" "Gateway"

echo
info "4/4 啟動 ngrok -> Gateway :$GATEWAY_PORT"
(
  nohup ngrok http "http://127.0.0.1:${GATEWAY_PORT}" \
    --log=stdout \
    >"$LOG_DIR/ngrok.log" 2>&1 &
  echo $! >"$PID_DIR/ngrok.pid"
)

PUBLIC_URL="$(fetch_ngrok_url || true)"
if [[ -z "${PUBLIC_URL:-}" ]]; then
  warn "拿不到 ngrok 網址（本機 / 內網仍可用）。常見原因："
  echo "  1) 已有 travel 的 ngrok → $HOME/start_travel.sh stop 後再跑本腳本"
  echo "  2) ngrok config add-authtoken <token>"
  echo "  3) tail -f $LOG_DIR/ngrok.log"
  echo "  4) 瀏覽器開 http://127.0.0.1:4040"
fi

APP_PATH="/transfer/"
PUBLIC_APP="${PUBLIC_URL:+${PUBLIC_URL}${APP_PATH}}"

cat <<EOF

${GREEN}========================================
  Medical stack 已啟動
========================================${NC}

EOF

if [[ -n "${PUBLIC_URL:-}" ]]; then
  cat <<EOF
${CYAN}外網請開這個（給手機 / 外面用）：${NC}
  ${GREEN}${PUBLIC_APP}${NC}

EOF
  echo "$PUBLIC_APP" >"$LOG_DIR/public_url.txt"
  ok "網址已寫入 $LOG_DIR/public_url.txt"
else
  warn "無 ngrok 外網網址"
fi

cat <<EOF
${CYAN}同網段內網也可開：${NC}
  http://${LAN_IP}:${GATEWAY_PORT}${APP_PATH}
  或前端直連 http://${LAN_IP}:${FRONTEND_PORT}${APP_PATH}
  後端 HTTPS   https://${LAN_IP}:${BACKEND_PORT}/api/ping

${CYAN}說明：${NC}
  - 外網只記 Gateway / ngrok 這一個入口，/api 才會通
  - Angular servePath 是 /transfer/，請帶這個 path
  - 麥克風在非 HTTPS 環境可能被擋；外網請走 ngrok 的 https
  - 免費 ngrok 第一次可能出現警告頁，按 Visit Site
  - 若 travel stack 也在跑，請先 stop 再開本腳本（ngrok 會搶）

${CYAN}Log：${NC}
  後端    $LOG_DIR/backend.log
  前端    $LOG_DIR/frontend.log
  Gateway $LOG_DIR/gateway.log
  ngrok   $LOG_DIR/ngrok.log
  監控台  http://127.0.0.1:4040

${CYAN}停止全部：${NC}
  $HOME/start_medical.sh stop

EOF
