#!/usr/bin/env bash
set -euo pipefail
CONF=/etc/nginx/conf.d/default.conf
cp -a "$CONF" "${CONF}.bak.mongo-$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/conf.d/default.conf')
text = p.read_text()
idx443 = text.find('listen       443 ssl;')
if idx443 < 0:
    raise SystemExit('no 443')
needle = "    if ($request_method !~* GET|HEAD|POST|DELETE) {"
pos = text.find(needle, idx443)
if pos >= 0:
    end = text.find('\n', text.find('}', pos)) + 1
    text = text[:pos] + "    if ($request_method !~* GET|HEAD|POST|DELETE|PUT|PATCH) {\n        return 403;\n    }\n" + text[end:]
    print('patched methods')
snip = '''
    location ^~ /api/mongo {
        proxy_pass http://127.0.0.1:8091;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_hide_header  X-Powered-By;
        proxy_http_version 1.1;
    }

'''
if 'location ^~ /api/mongo' not in text:
    marker = '    location ^~ /transfer/'
    pos = text.find(marker)
    text = text[:pos] + snip + text[pos:]
    print('added /api/mongo')
p.write_text(text)
print('ok')
PY
nginx -t
systemctl reload nginx
echo DONE
