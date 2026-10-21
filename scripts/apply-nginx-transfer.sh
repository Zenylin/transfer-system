#!/usr/bin/env bash
# 需要 sudo：把 /transfer/ 與 medical API 掛到既有 443 server
set -euo pipefail

CONF="/etc/nginx/conf.d/default.conf"
MARKER="location ^~ /transfer/"
BACKUP="/etc/nginx/conf.d/default.conf.bak.medical-$(date +%Y%m%d%H%M%S)"
SNIPPET="$(dirname "$0")/nginx-medical-transfer.conf.snippet"

if [[ $EUID -ne 0 ]]; then
  echo "請用 sudo 執行：$0"
  echo "  sudo $0"
  exit 1
fi

[[ -f "$CONF" ]] || { echo "找不到 $CONF"; exit 1; }
[[ -f "$SNIPPET" ]] || { echo "找不到 $SNIPPET"; exit 1; }

if grep -qF "$MARKER" "$CONF"; then
  echo "已存在 /transfer/ location，略過寫入，只 reload"
  nginx -t && systemctl reload nginx
  echo "OK: nginx reloaded"
  exit 0
fi

cp -a "$CONF" "$BACKUP"
echo "已備份 → $BACKUP"

# 插在 443 server 的「location / {」之前（clinic 靜態或 1338 皆可）
SNIPPET_ABS="$(readlink -f "$SNIPPET")"
python3 - "$SNIPPET_ABS" <<'PY'
import sys
from pathlib import Path
conf_path = Path("/etc/nginx/conf.d/default.conf")
snip_path = Path(sys.argv[1])
text = conf_path.read_text()
snip = snip_path.read_text().rstrip() + "\n\n"
marker = "listen       443 ssl;"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("找不到 listen 443 ssl")
rest = text[idx:]
needles = [
    "    location / {\n        root  /usr/local/clinic_sails_upgrade/dist/expense-tracker/browser;",
    "    location / {\n        proxy_pass http://127.0.0.1:1338;",
]
pos = -1
for needle in needles:
    pos = rest.find(needle)
    if pos >= 0:
        break
if pos < 0:
    raise SystemExit("找不到 443 server 內的 location / 插入點")
abs_pos = idx + pos
conf_path.write_text(text[:abs_pos] + snip + text[abs_pos:])
print("已插入 medical /transfer 與 API locations")
PY

nginx -t
systemctl reload nginx
echo "OK: https://qatm.qoca.net/transfer/ 已掛上 Gateway :8091"
