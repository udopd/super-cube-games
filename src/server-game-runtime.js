import http from 'node:http';
import net from 'node:net';

const instances = new Map();
const pendingStarts = new Map();
const runtimeUrl = new URL(process.env.SERVER_GAME_RUNTIME_URL || 'http://game-runtime:4100');
const runtimeToken = String(process.env.SERVER_GAME_RUNTIME_TOKEN || '');

function requestRuntime(pathname, { method = 'GET', headers = {}, timeout = 30000 } = {}) {
  if (runtimeToken.length < 32) return Promise.reject(new Error('Server-game runtime manager is not configured: SERVER_GAME_RUNTIME_TOKEN must be at least 32 characters.'));
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: runtimeUrl.hostname, port: Number(runtimeUrl.port || 80), method, path: pathname,
      headers: { 'x-runtime-token': runtimeToken, ...headers, host: runtimeUrl.host }, timeout }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes <= 1024 * 1024) chunks.push(chunk); });
      response.on('end', () => {
        if (bytes > 1024 * 1024) return reject(new Error('Runtime manager response was too large.'));
        const raw = Buffer.concat(chunks).toString('utf8');
        let payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw }; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = payload.error || `Runtime manager returned HTTP ${response.statusCode} for ${method} ${pathname}.`;
          // In development, the manager includes a bounded diagnostic detail. Preserve it in
          // the Platform API logs/UI instead of discarding the actual Docker/game failure.
          const detail = typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail.trim().slice(0, 2600) : '';
          return reject(new Error(detail ? `${message} Details: ${detail}` : message));
        }
        resolve(payload);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Runtime manager request timed out.')));
    request.on('error', error => reject(new Error(`Game runtime manager unavailable (${runtimeUrl.host}): ${error.message}`)));
    request.end();
  });
}
function safeSlug(slug) {
  const value = String(slug || '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 70) throw new Error('Invalid game slug.');
  return value;
}
export async function ensureServerGame(game) {
  const slug = safeSlug(game.slug);
  if (pendingStarts.has(slug)) return pendingStarts.get(slug);
  const promise = requestRuntime(`/v1/games/${encodeURIComponent(slug)}/start`, { method: 'POST', timeout: 90000 })
    .then(result => {
      const instance = { slug, id: result.id || null, state: result.state || 'running', startedAt: result.startedAt || Date.now(), pingMs: result.pingMs ?? null, port: result.port || 3000 };
      instances.set(slug, instance);
      return instance;
    })
    .finally(() => pendingStarts.delete(slug));
  pendingStarts.set(slug, promise);
  return promise;
}
export async function serverGameStatus(slug) {
  const safe = safeSlug(slug);
  const result = await requestRuntime(`/v1/games/${encodeURIComponent(safe)}/status`, { timeout: 8000 });
  if (result.state === 'running') instances.set(safe, { slug: safe, id: result.id || null, state: 'running', startedAt: result.startedAt || Date.now(), pingMs: result.pingMs ?? null, port: result.port || 3000 });
  else instances.delete(safe);
  return result;
}
export function serverGameInstance(slug) { return instances.get(slug) || null; }
export async function stopServerGame(slug) {
  const safe = safeSlug(slug);
  await requestRuntime(`/v1/games/${encodeURIComponent(safe)}/stop`, { method: 'POST', timeout: 15000 });
  instances.delete(safe);
}
export async function stopAllServerGames() {
  await requestRuntime('/v1/games/stop-all', { method: 'POST', timeout: 60000 });
  instances.clear();
}
function managerProxyPath(slug, subpath, originalUrl) {
  const query = String(originalUrl || '').includes('?') ? String(originalUrl).slice(String(originalUrl).indexOf('?')) : '';
  const safePath = String(subpath || '').replace(/^\/+/, '');
  return `/v1/games/${encodeURIComponent(safeSlug(slug))}/proxy/${safePath}${query}`;
}
export function proxyServerGame(req, res, instance, subpath = '', slug = '') {
  const pathname = managerProxyPath(slug || instance?.slug, subpath, req.url);
  const headers = { ...req.headers, 'x-runtime-token': runtimeToken, 'x-forwarded-host': req.get('host'), 'x-forwarded-proto': req.protocol };
  for (const key of ['cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'origin', 'referer']) delete headers[key];
  headers.host = runtimeUrl.host;
  const upstream = http.request({ hostname: runtimeUrl.hostname, port: Number(runtimeUrl.port || 80), method: req.method, path: pathname, headers, timeout: 90000 }, response => {
    res.status(response.statusCode || 502);
    const type = String(response.headers['content-type'] || '');
    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined || ['content-length', 'transfer-encoding', 'set-cookie', 'set-cookie2'].includes(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }
    if (type.includes('text/html') && slug) {
      const chunks = []; let length = 0;
      response.on('data', chunk => { length += chunk.length; if (length <= 4 * 1024 * 1024) chunks.push(chunk); });
      response.on('end', () => {
        if (length > 4 * 1024 * 1024) return res.status(502).end('Server game HTML exceeds 4 MB.');
        let html = Buffer.concat(chunks).toString('utf8');
        const sdk = `<script src="/js/game-sdk.js?slug=${encodeURIComponent(slug)}"></script>`;
        if (!html.includes('/js/game-sdk.js')) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${sdk}</head>`) : `${sdk}${html}`;
        res.end(html);
      });
    } else response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Runtime manager timed out.')));
  upstream.on('error', error => { if (!res.headersSent) res.status(503).type('text').send(`Server game runtime is unavailable: ${error.message}`); else res.destroy(error); });

  // JSON/urlencoded parsers have already consumed these request streams. Replay the
  // preserved bytes and correct framing; otherwise continue streaming unparsed uploads.
  if (Buffer.isBuffer(req.rawBody)) {
    upstream.removeHeader?.('transfer-encoding');
    upstream.setHeader('content-length', String(req.rawBody.length));
    upstream.end(req.rawBody);
  } else {
    req.pipe(upstream);
  }
}
export async function proxyServerGameUpgrade(req, socket, head, instance, subpath = '') {
  const slug = safeSlug(instance?.slug || String(req.url || '').match(/^\/server-games(?:-test)?\/([^/?]+)/)?.[1]);
  const pathname = managerProxyPath(slug, subpath, req.url);
  const upstream = net.connect(Number(runtimeUrl.port || 80), runtimeUrl.hostname);
  upstream.on('connect', () => {
    const lines = [`${req.method} ${pathname} HTTP/${req.httpVersion}`, `Host: ${runtimeUrl.host}`, `X-Runtime-Token: ${runtimeToken}`];
    const raw = req.rawHeaders || [];
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i];
      if (!['host', 'cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'origin', 'referer', 'x-runtime-token'].includes(name.toLowerCase())) lines.push(`${name}: ${raw[i + 1]}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}
