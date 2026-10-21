#!/usr/bin/env bash
# Medical stack 啟動腳本
#
# 建議用法（正式／含 PWA Service Worker）：
#   ~/start_medical.sh            # 等同 prod
#   ~/start_medical.sh prod       # 建置前端 + node 後端 + Gateway 靜態 + ngrok
#   ~/start_medical.sh prod --no-build   # 沿用既有 dist，略過重建
#
# 開發熱重載：
#   ~/start_medical.sh dev        # nodemon + ng serve + Gateway 代理
#
# 其他：
#   ~/start_medical.sh build      # 只做 production build
#   ~/start_medical.sh stop       # 停止全部
#   ~/start_medical.sh status     # 看埠與網址
#
set -euo pipefail

ROOT="${ROOT:-$HOME/medical-system}"
ROOT_FRONTEND="${ROOT_FRONTEND:-$ROOT/frontend}"
ROOT_BACKEND="${ROOT_BACKEND:-$ROOT/backend}"
DIST_DIR="${DIST_DIR:-$ROOT_FRONTEND/dist/frontend/browser}"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"
GATEWAY_PORT="${GATEWAY_PORT:-8091}"
LAN_IP="${LAN_IP:-192.168.50.2}"
# 固定網域（如 qatm.qoca.net）部署時設 SKIP_NGROK=1
SKIP_NGROK="${SKIP_NGROK:-0}"

LOG_DIR="${LOG_DIR:-$ROOT/log}"
PID_DIR="${PID_DIR:-$ROOT/run/pids}"
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
  # Prefer TCP connect — ss|grep 在大量 listener 時偶發誤判
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
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
  # 清掉可能殘留的 ng serve / nodemon
  pkill -f "ng serve --host 0.0.0.0 --port ${FRONTEND_PORT}" >/dev/null 2>&1 || true
  pkill -f "nodemon server.js" >/dev/null 2>&1 || true
  pkill -f "ngrok http .*${GATEWAY_PORT}" >/dev/null 2>&1 || true
  sleep 1
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

show_status() {
  echo
  info "埠狀態"
  for port in "$BACKEND_PORT" "$FRONTEND_PORT" "$GATEWAY_PORT"; do
    if port_in_use "$port"; then
      ok ":$port 聽取中"
    else
      warn ":$port 未聽取"
    fi
  done
  if [[ -f "$LOG_DIR/public_url.txt" ]]; then
    echo
    info "上次外網網址："
    cat "$LOG_DIR/public_url.txt"
    echo
  fi
  if curl -fsS "http://127.0.0.1:4040/api/tunnels" >/tmp/medical_ngrok_tunnels.json 2>/dev/null; then
    info "目前 ngrok tunnels："
    python3 - <<'PY'
import json
data=json.load(open("/tmp/medical_ngrok_tunnels.json"))
for t in data.get("tunnels") or []:
    print(" ", t.get("public_url"), "->", (t.get("config") or {}).get("addr"))
PY
  fi
}

build_frontend() {
  info "Production build 前端（含 Service Worker / PWA）..."
  (
    cd "$ROOT_FRONTEND"
    npm run build -- --configuration=production
  )
  [[ -f "$DIST_DIR/index.html" ]] || {
    err "找不到建置結果：$DIST_DIR/index.html"
    exit 1
  }
  [[ -f "$DIST_DIR/ngsw-worker.js" ]] || warn "未看到 ngsw-worker.js，PWA 可能未啟用"
  ok "前端建置完成 → $DIST_DIR"
}

print_summary() {
  local mode="$1"
  local public_url="${2:-}"
  local app_path="/transfer/"
  local public_app="${public_url:+${public_url}${app_path}}"

  cat <<EOF

${GREEN}========================================
  Medical stack 已啟動（${mode}）
========================================${NC}

EOF

  if [[ -n "${public_url:-}" ]]; then
    cat <<EOF
${CYAN}外網請開這個（給手機 / 外面用）：${NC}
  ${GREEN}${public_app}${NC}

EOF
    echo "$public_app" >"$LOG_DIR/public_url.txt"
    ok "網址已寫入 $LOG_DIR/public_url.txt"
  else
    warn "無 ngrok 外網網址"
  fi

  cat <<EOF
${CYAN}同網段內網也可開：${NC}
  http://${LAN_IP}:${GATEWAY_PORT}${app_path}

${CYAN}架構（${mode}）：${NC}
EOF

  if [[ "$mode" == "prod" ]]; then
    cat <<EOF
  ngrok → Gateway :${GATEWAY_PORT}
           ├─ /api/*      → 後端 HTTPS :${BACKEND_PORT}（node，非 nodemon）
           └─ /transfer/* → 靜態 dist（PWA / Service Worker 有作用）
EOF
  else
    cat <<EOF
  ngrok → Gateway :${GATEWAY_PORT}
           ├─ /api/*      → 後端 HTTPS :${BACKEND_PORT}（nodemon）
           └─ /transfer/* → Angular ng serve :${FRONTEND_PORT}（無 SW）
EOF
  fi

  cat <<EOF

${CYAN}說明：${NC}
  - 正式環境請用 prod（預設），才會註冊 Service Worker、離線草稿才能搭配快取殼層
  - 開發改碼用：~/start_medical.sh dev
  - 外網麥克風需要 https（走 ngrok）
  - 免費 ngrok 第一次可能出現警告頁，按 Visit Site
  - 若 travel stack 也在跑，請先 stop（ngrok 會搶）

${CYAN}Log：${NC}
  後端    $LOG_DIR/backend.log
  前端    $LOG_DIR/frontend.log
  Gateway $LOG_DIR/gateway.log
  ngrok   $LOG_DIR/ngrok.log
  監控台  http://127.0.0.1:4040

${CYAN}停止全部：${NC}
  $HOME/start_medical.sh stop

EOF
}

start_ngrok() {
  info "啟動 ngrok -> Gateway :$GATEWAY_PORT"
  (
    nohup ngrok http "http://127.0.0.1:${GATEWAY_PORT}" \
      --log=stdout \
      >"$LOG_DIR/ngrok.log" 2>&1 &
    echo $! >"$PID_DIR/ngrok.pid"
  )
}

CMD="${1:-prod}"
shift || true
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    *) warn "忽略未知參數：$arg" ;;
  esac
done

case "$CMD" in
  stop)
    stop_stack
    ok "已停止"
    exit 0
    ;;
  status)
    show_status
    exit 0
    ;;
  build)
    need_cmd npm
    build_frontend
    exit 0
    ;;
  prod|start|"")
    MODE=prod
    ;;
  dev)
    MODE=dev
    ;;
  -h|--help|help)
    sed -n '2,20p' "$0"
    exit 0
    ;;
  *)
    err "未知指令：$CMD（可用：prod | dev | build | stop | status）"
    exit 1
    ;;
esac

need_cmd ss
need_cmd curl
need_cmd python3
need_cmd node
need_cmd npm
need_cmd ngrok

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

if command -v mongo >/dev/null 2>&1; then
  if ! mongo --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    err "MongoDB 無法連線（預期 localhost:27017）。請先啟動 mongod。"
    exit 1
  fi
  ok "MongoDB 可用"
elif command -v mongosh >/dev/null 2>&1; then
  if ! mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    err "MongoDB 無法連線。請先啟動 mongod。"
    exit 1
  fi
  ok "MongoDB 可用"
else
  warn "找不到 mongo / mongosh，略過檢查（若後端連不上 DB 再啟動 mongod）"
fi

if ! ngrok config check >/dev/null 2>&1; then
  warn "ngrok 設定可能不完整。若等下失敗，請先執行："
  echo "  ngrok config add-authtoken <你的token>"
fi

if [[ "$MODE" == "prod" && "$NO_BUILD" -eq 0 ]]; then
  build_frontend
elif [[ "$MODE" == "prod" ]]; then
  [[ -f "$DIST_DIR/index.html" ]] || {
    err "沒有 dist，請先 ~/start_medical.sh build 或拿掉 --no-build"
    exit 1
  }
  ok "沿用既有 dist：$DIST_DIR"
fi

stop_stack

echo
info "1/3 啟動後端 HTTPS (port $BACKEND_PORT) [${MODE}]"
(
  cd "$ROOT_BACKEND"
  if [[ "$MODE" == "prod" ]]; then
    nohup npm start >"$LOG_DIR/backend.log" 2>&1 &
  else
    nohup npm run dev >"$LOG_DIR/backend.log" 2>&1 &
  fi
  echo $! >"$PID_DIR/backend.pid"
)
wait_port "$BACKEND_PORT" "後端"

if [[ "$MODE" == "dev" ]]; then
  echo
  info "2/4 啟動 Angular ng serve (port $FRONTEND_PORT)"
  (
    cd "$ROOT_FRONTEND"
    nohup npm start -- --host 0.0.0.0 --port "$FRONTEND_PORT" \
      >"$LOG_DIR/frontend.log" 2>&1 &
    echo $! >"$PID_DIR/frontend.pid"
  )
  wait_port "$FRONTEND_PORT" "Angular" 180

  echo
  info "3/4 啟動 Gateway DEV (port $GATEWAY_PORT)"
  (
    cd "$ROOT_FRONTEND"
    BACKEND_PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" GATEWAY_PORT="$GATEWAY_PORT" \
      BACKEND_HTTPS=1 LAN_IP="$LAN_IP" \
      nohup node scripts/gateway.mjs >"$LOG_DIR/gateway.log" 2>&1 &
    echo $! >"$PID_DIR/gateway.pid"
  )
else
  echo
  info "2/3 啟動 Gateway PROD 靜態站 (port $GATEWAY_PORT)"
  : >"$LOG_DIR/frontend.log"
  echo "[prod] 前端由 Gateway 直接提供 $DIST_DIR" >>"$LOG_DIR/frontend.log"
  (
    cd "$ROOT_FRONTEND"
    BACKEND_PORT="$BACKEND_PORT" GATEWAY_PORT="$GATEWAY_PORT" \
      BACKEND_HTTPS=1 LAN_IP="$LAN_IP" STATIC_ROOT="$DIST_DIR" \
      nohup node scripts/gateway.mjs >"$LOG_DIR/gateway.log" 2>&1 &
    echo $! >"$PID_DIR/gateway.pid"
  )
fi
wait_port "$GATEWAY_PORT" "Gateway"

PUBLIC_URL=""
if [[ "$SKIP_NGROK" == "1" ]]; then
  echo
  info "略過 ngrok（SKIP_NGROK=1；請用 nginx 綁固定網域）"
  PUBLIC_URL="https://qatm.qoca.net"
else
  echo
  start_ngrok
  PUBLIC_URL="$(fetch_ngrok_url || true)"
  if [[ -z "${PUBLIC_URL:-}" ]]; then
    warn "拿不到 ngrok 網址（本機 / 內網仍可用）。常見原因："
    echo "  1) 已有 travel 的 ngrok → $HOME/start_travel.sh stop 後再跑本腳本"
    echo "  2) ngrok config add-authtoken <token>"
    echo "  3) tail -f $LOG_DIR/ngrok.log"
    echo "  4) 瀏覽器開 http://127.0.0.1:4040"
  fi
fi

print_summary "$MODE" "${PUBLIC_URL:-}"
