#!/usr/bin/env node
/**
 * 單一入口 Gateway
 * - /api/*  → 後端 HTTPS :3000
 * - 其餘   → 正式：靜態 dist（STATIC_ROOT）／開發：Angular :4200
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 8091);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 4200);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3000);
const BACKEND_HTTPS = String(process.env.BACKEND_HTTPS || '1') !== '0';
const LAN_IP = process.env.LAN_IP || '172.16.50.2';
const STATIC_ROOT = process.env.STATIC_ROOT
  ? path.resolve(process.env.STATIC_ROOT)
  : '';
const APP_BASE = '/transfer';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function proxy(req, res, port, useHttps) {
  const mod = useHttps ? https : http;
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${port}`,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http',
  };
  delete headers['accept-encoding'];

  const opts = {
    hostname: '127.0.0.1',
    port,
    path: req.url,
    method: req.method,
    headers,
    rejectUnauthorized: false,
  };

  const upstream = mod.request(opts, (upRes) => {
    const outHeaders = { ...upRes.headers };
    outHeaders['cache-control'] = 'no-store';
    res.writeHead(upRes.statusCode || 502, outHeaders);
    upRes.pipe(res);
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Gateway 連不上 :${port}</h1><pre>${err.message}</pre>`,
    );
  });

  req.pipe(upstream);
}

function sendHelp(res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>NTMS 手機入口</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f4f7f6;color:#1e293b}
    h1{font-size:1.4rem;margin:0 0 8px}
    p{line-height:1.5;color:#475569}
    a.btn{display:block;text-align:center;background:#2563eb;color:#fff;text-decoration:none;
      padding:16px;border-radius:12px;font-weight:700;margin:16px 0;font-size:1.05rem}
    .card{background:#fff;border-radius:12px;padding:16px;margin-top:16px;border:1px solid #e2e8f0}
    code{word-break:break-all;background:#f1f5f9;padding:2px 6px;border-radius:6px}
    .warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:12px;border-radius:10px;margin-top:12px}
  </style>
</head>
<body>
  <h1>NTMS 新生兒轉診系統</h1>
  <p>手機請點下面按鈕進入表單（路徑一定要有 <code>/transfer/</code>）。</p>
  <a class="btn" href="/transfer/">進入系統</a>
  <div class="card">
    <p><strong>同 Wi‑Fi 內網：</strong><br><code>http://${LAN_IP}:${GATEWAY_PORT}/transfer/</code></p>
    <div class="warn">
      若用 ngrok 外網連結，免費版會先出現英文警告頁，請按 <strong>Visit Site</strong> 才會進入。
      手機必須與伺服器同一網段，或改走 ngrok；用 4G/訪客 Wi‑Fi 開內網 IP 會打不開。
    </div>
  </div>
</body>
</html>`);
}

function safeJoin(root, relPath) {
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  return full;
}

function cacheControlFor(filePath) {
  const base = path.basename(filePath);
  if (base === 'index.html' || base === 'ngsw.json' || base.endsWith('.webmanifest')) {
    return 'no-cache';
  }
  if (/-[A-Z0-9]{8,}\.(js|css)$/i.test(base)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cacheControlFor(filePath),
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  const url = req.url || '/';
  const pathOnly = decodeURIComponent(url.split('?')[0] || '/');

  let rel = pathOnly;
  if (rel === APP_BASE || rel === `${APP_BASE}/`) {
    rel = '/index.html';
  } else if (rel.startsWith(`${APP_BASE}/`)) {
    rel = rel.slice(APP_BASE.length);
  }

  // 去掉開頭 /
  rel = rel.replace(/^\/+/, '');
  if (!rel) rel = 'index.html';

  let filePath = safeJoin(STATIC_ROOT, rel);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  // SPA fallback：/transfer/form-2 等路由回 index.html
  if (!path.extname(rel) || rel.endsWith('/')) {
    const indexPath = path.join(STATIC_ROOT, 'index.html');
    if (fs.existsSync(indexPath)) {
      sendFile(res, indexPath);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const pathOnly = url.split('?')[0];

  if (pathOnly === '/' || pathOnly === '') {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);
    if (isMobile) {
      sendHelp(res);
      return;
    }
    res.writeHead(302, { Location: '/transfer/' });
    res.end();
    return;
  }

  if (pathOnly === '/help' || pathOnly === '/mobile') {
    sendHelp(res);
    return;
  }

  if (pathOnly.startsWith('/api')) {
    proxy(req, res, BACKEND_PORT, BACKEND_HTTPS);
    return;
  }

  if (STATIC_ROOT) {
    serveStatic(req, res);
    return;
  }

  proxy(req, res, FRONTEND_PORT, false);
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '/';
  if (STATIC_ROOT && !url.startsWith('/api')) {
    socket.destroy();
    return;
  }
  const toBackend = url.startsWith('/api');
  const port = toBackend ? BACKEND_PORT : FRONTEND_PORT;
  const useHttps = toBackend && BACKEND_HTTPS;
  const mod = useHttps ? https : http;
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const upstream = mod.request({
    hostname: '127.0.0.1',
    port,
    path: url,
    method: req.method,
    headers,
    rejectUnauthorized: false,
  });
  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (upHead?.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end(head);
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  if (STATIC_ROOT) {
    console.log(
      `🌉 Medical Gateway PROD http://0.0.0.0:${GATEWAY_PORT}  ( static=${STATIC_ROOT}, /api -> ${BACKEND_HTTPS ? 'https' : 'http'}://:${BACKEND_PORT} )`,
    );
  } else {
    console.log(
      `🌉 Medical Gateway DEV http://0.0.0.0:${GATEWAY_PORT}  ( / -> :${FRONTEND_PORT}, /api -> ${BACKEND_HTTPS ? 'https' : 'http'}://:${BACKEND_PORT} )`,
    );
  }
});
