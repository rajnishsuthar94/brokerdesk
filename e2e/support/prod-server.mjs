// Serves the PRODUCTION web build like nginx does in deployment, for e2e tests:
// - the same security headers (parsed from apps/web/security-headers.conf, so the
//   CSP is tested against the real build),
// - the same caching rules (service-worker files never cached),
// - SPA fallback to index.html, and /api proxied to the API.
// Usage: PROD_PORT=4500 API_PROXY_TARGET=http://localhost:3300 node e2e/support/prod-server.mjs
import { createReadStream, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '..', '..');
const root = join(repo, 'apps', 'web', 'dist', 'web', 'browser');
const port = Number(process.env.PROD_PORT ?? 4500);
const api = new URL(process.env.API_PROXY_TARGET ?? 'http://localhost:3300');

const securityHeaders = Object.fromEntries(
  [...readFileSync(join(repo, 'apps', 'web', 'security-headers.conf'), 'utf8').matchAll(/^add_header (\S+) "(.*)" always;$/gm)].map((m) => [m[1], m[2]]),
);
if (!securityHeaders['Content-Security-Policy']) throw new Error('security-headers.conf: no CSP found');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const NO_CACHE = /^\/(ngsw-worker\.js|ngsw\.json|safety-worker\.js|worker-basic\.min\.js|manifest\.webmanifest)$/;

function fileFor(pathname) {
  const target = normalize(join(root, decodeURIComponent(pathname)));
  if (!target.startsWith(root + sep) && target !== root) return null; // no traversal
  try {
    return statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request(
        { hostname: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502).end();
      });
      req.pipe(upstream);
      return;
    }
    let file = fileFor(url.pathname);
    let cache = 'public, max-age=31536000, immutable';
    if (!file) {
      if (extname(url.pathname)) {
        res.writeHead(404, securityHeaders).end();
        return;
      }
      file = join(root, 'index.html');
    }
    if (file.endsWith('index.html') || NO_CACHE.test(url.pathname)) cache = 'no-cache';
    res.writeHead(200, { ...securityHeaders, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
    createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`prod build on http://localhost:${port} → api ${api.origin}`));
