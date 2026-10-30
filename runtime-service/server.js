import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const port = Number(process.env.SERVER_GAME_RUNTIME_PORT || 4100);
const token = String(process.env.SERVER_GAME_RUNTIME_TOKEN || '');
const image = String(process.env.SERVER_GAME_DOCKER_IMAGE || 'node:22-alpine');
const storageVolumeLabel = String(process.env.PLATFORM_STORAGE_VOLUME_LABEL || 'platform-storage');
const runtimeContainerName = String(process.env.SERVER_GAME_RUNTIME_CONTAINER_NAME || 'super-cube-game-runtime');
const instances = new Map();
const pending = new Map();

if (token.length < 32) {
  console.error('SERVER_GAME_RUNTIME_TOKEN must contain at least 32 characters.');
  process.exit(1);
}

const execDocker = (args, timeout = 30000) => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', settled = false;
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    if (!settled) { settled = true; reject(new Error('Docker command timed out.')); }
  }, timeout);
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', error => {
    clearTimeout(timer);
    if (!settled) {
      settled = true;
      reject(new Error(error.code === 'ENOENT'
        ? 'Docker CLI was not found inside the dedicated game-runtime service.'
        : `Could not call Docker Engine: ${error.message}`));
    }
  });
  child.on('close', code => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    if (code === 0) resolve(stdout.trim());
    else reject(new Error((stderr.trim() || `Docker exited with code ${code}`).slice(0, 700)));
  });
});

function safeSlug(value) {
  const slug = String(value || '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 70) throw new Error('Invalid game slug.');
  return slug;
}
function names(slug) {
  const networkSlug = slug.length <= 48 ? slug : `${slug.slice(0, 39)}-${crypto.createHash('sha256').update(slug).digest('hex').slice(0, 8)}`;
  return { container: `scgame-${slug}`, network: `scg-${networkSlug}`, volume: `scgame-data-${slug}` };
}
function authorized(req) {
  const candidate = String(req.headers['x-runtime-token'] || '');
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && a.length > 0 && (awaitSafeTimingEqual(a, b));
}
function awaitSafeTimingEqual(a, b) {
  // Constant-time comparison for same-length secrets without bringing in an external package.
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
async function readJson(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 8192) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
async function findStorageVolume() {
  const explicit = String(process.env.PLATFORM_STORAGE_VOLUME_NAME || '').trim();
  if (explicit) return explicit;
  // Resolve the exact named volume mounted into this manager; this avoids guessing the
  // Compose project prefix and works when the checkout directory has a custom name.
  try {
    const mounted = await execDocker(['inspect', '--format', '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Name}}{{end}}{{end}}', runtimeContainerName]);
    if (mounted.trim()) return mounted.trim();
  } catch {}
  const output = await execDocker(['volume', 'ls', '--filter', `label=com.docker.compose.volume=${storageVolumeLabel}`, '--format', '{{.Name}}']);
  const volumes = output.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (volumes.length !== 1) {
    throw new Error(volumes.length === 0
      ? `Could not find Compose storage volume labeled ${storageVolumeLabel}. Ensure platform-storage is a named Compose volume.`
      : `Found multiple storage volumes; set PLATFORM_STORAGE_VOLUME_NAME to the correct volume (${volumes.join(', ')}).`);
  }
  return volumes[0];
}
async function ensureNetwork(slug) {
  const network = names(slug).network;
  try { await execDocker(['network', 'inspect', network]); }
  catch { await execDocker(['network', 'create', '--internal', '--label', `com.supercube.game=${slug}`, network]); }
  // The manager joins each internal game network for proxying, but its API listens only
  // on the original Compose interface address, so game containers cannot call the manager API.
  await execDocker(['network', 'connect', network, runtimeContainerName]).catch(err => {
    if (!/already exists|already connected/i.test(err.message)) throw err;
  });
  return network;
}
async function containerIsRunning(container) {
  try {
    const output = await execDocker(['inspect', '--format', '{{.State.Running}}', container]);
    return output === 'true';
  } catch { return false; }
}
async function getContainerIp(container) {
  const output = await execDocker(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container]);
  const ip = output.trim();
  if (!net.isIP(ip)) throw new Error('Could not resolve the isolated game container IP.');
  return ip;
}
async function getContainerPort(container) {
  const output = await execDocker(['inspect', '--format', '{{index .Config.Labels "com.supercube.game-port"}}', container]).catch(() => '');
  const value = Number(output.trim());
  return Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : 3000;
}
async function readGamePort(slug) {
  const file = `/app/storage/games/${safeSlug(slug)}/server/port.txt`;
  let value;
  try { value = (await fs.readFile(file, 'utf8')).trim(); }
  catch (error) {
    if (error.code === 'ENOENT') return 3000;
    throw error;
  }
  if (!/^\d{1,5}$/.test(value)) throw new Error('server/port.txt must contain a port number from 1024 to 65535.');
  const gamePort = Number(value);
  if (!Number.isInteger(gamePort) || gamePort < 1024 || gamePort > 65535) throw new Error('server/port.txt must contain a port number from 1024 to 65535.');
  return gamePort;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function readyPing(ip, gamePort) {
  for (let i = 0; i < 30; i += 1) {
    const started = performance.now();
    const ready = await new Promise(resolve => {
      const request = http.get({ host: ip, port: gamePort, path: '/', timeout: 500 }, response => {
        response.resume(); resolve(response.statusCode < 500 ? Math.round(performance.now() - started) : null);
      });
      request.on('timeout', () => { request.destroy(); resolve(null); });
      request.on('error', () => resolve(null));
    });
    if (ready !== null) return ready;
    await wait(250);
  }
  return null;
}
async function removeGameVolume(slug) {
  try { await execDocker(['volume', 'rm', names(slug).volume], 10000); } catch {}
}
async function gameContainerLogs(container) {
  // Docker emits a container's stdout and stderr through separate pipes. Capture both
  // before cleanup so startup failures can be diagnosed without leaving game containers behind.
  return new Promise(resolve => {
    const child = spawn('docker', ['logs', '--tail', '50', container], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', () => resolve('Container log capture failed.'));
    child.on('close', () => resolve(`${stdout}\n${stderr}`.trim().slice(-2400) || 'No container logs were produced.'));
  });
}
async function stopOne(slug) {
  slug = safeSlug(slug);
  const { container, network } = names(slug);
  try { await execDocker(['stop', '--time=3', container], 10000); } catch {}
  // Keep an exited container until diagnostics have been captured, then remove it explicitly.
  try { await execDocker(['rm', '-f', container], 10000); } catch {}
  try { await execDocker(['network', 'disconnect', network, runtimeContainerName], 10000); } catch {}
  try { await execDocker(['network', 'rm', network], 10000); } catch {}
  await removeGameVolume(slug);
  instances.delete(slug);
  return { slug, state: 'stopped' };
}
async function startOne(slug) {
  slug = safeSlug(slug);
  const gamePort = await readGamePort(slug);
  const prior = instances.get(slug);
  if (await containerIsRunning(names(slug).container)) {
    const { container, network, volume } = names(slug);
    const runningPort = await getContainerPort(container);
    await execDocker(['network', 'connect', network, runtimeContainerName]).catch(err => { if (!/already exists|already connected/i.test(err.message)) throw err; });
    const ip = await getContainerIp(container);
    const pingMs = await readyPing(ip, runningPort);
    if (pingMs !== null && runningPort === gamePort) {
      const id = (await execDocker(['inspect', '--format', '{{.Id}}', container])).slice(0, 64);
      const existing = { slug, id, container, network, volume, ip, port: runningPort, startedAt: prior?.startedAt || Date.now(), state: 'running', pingMs };
      instances.set(slug, existing);
      return existing;
    }
    await stopOne(slug);
  }
  const storageVolume = await findStorageVolume();
  const sourceDir = `/app/storage/games/${slug}`;
  const entry = `${sourceDir}/server/index.js`;
  try { await fs.access(entry); }
  catch { throw new Error('Server game has no server/index.js entry point in platform storage.'); }
  const { container, network, volume } = names(slug);

  // Remove a previous stopped/failed container before recreating its isolated filesystem.
  try { await execDocker(['rm', '-f', container], 10000); } catch {}
  // Recreate a per-game data volume so the untrusted game only sees its own published files,
  // never the platform volume or another draft. ZIP extraction intentionally creates files as
  // 0640 for the host app; make the isolated, read-only copy world-readable because the game
  // process runs as an unrelated unprivileged UID (10001). Without this, Node cannot read the
  // entrypoint and the container exits immediately. The copy helper has no network access.
  await removeGameVolume(slug);
  await execDocker(['volume', 'create', '--label', `com.supercube.game=${slug}`, volume]);
  await execDocker(['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--mount', `type=volume,source=${storageVolume},target=/src,readonly`,
    '--mount', `type=volume,source=${volume},target=/dst`,
    '--entrypoint', 'sh', image, '-c', `set -eu; test -f /src/games/${slug}/server/index.js; cp -a /src/games/${slug}/. /dst/; chmod -R a+rX /dst`], 60000);
  await ensureNetwork(slug);
  const id = await execDocker(['run', '-d', '--name', container,
    '--log-driver=json-file', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3', '--log-opt', 'mode=non-blocking',
    '--network', network, '--cpus=0.50', '--memory=256m', '--memory-swap=256m', '--pids-limit=128',
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--user=10001:10001', '-e', `PORT=${gamePort}`, `--expose=${gamePort}`, '--label', `com.supercube.game-port=${gamePort}`, '--mount', `type=volume,source=${volume},target=/app,readonly`,
    '-w', '/app', image, 'node', '/app/server/index.js'], 30000);
  let ip = '';
  try { ip = await getContainerIp(container); } catch { /* exited containers are retained for logs below */ }
  const pingMs = ip ? await readyPing(ip, gamePort) : null;
  if (pingMs === null) {
    const logs = await gameContainerLogs(container);
    await stopOne(slug);
    throw new Error(`Server game did not become ready on 0.0.0.0:${gamePort}. Startup logs: ${logs}`);
  }
  const instance = { slug, id: id.slice(0, 64), container, network, volume, ip, port: gamePort, startedAt: Date.now(), state: 'running', pingMs };
  instances.set(slug, instance);
  return instance;
}
async function ensureRunning(slug) {
  if (pending.has(slug)) return pending.get(slug);
  const promise = startOne(slug).finally(() => pending.delete(slug));
  pending.set(slug, promise);
  return promise;
}
async function statusOne(slug) {
  slug = safeSlug(slug);
  const container = names(slug).container;
  if (!await containerIsRunning(container)) { instances.delete(slug); return { slug, state: 'stopped', pingMs: null }; }
  const network = names(slug).network;
  await execDocker(['network', 'connect', network, runtimeContainerName]).catch(err => { if (!/already exists|already connected/i.test(err.message)) throw err; });
  const ip = await getContainerIp(container);
  const gamePort = await getContainerPort(container);
  const pingMs = await readyPing(ip, gamePort);
  if (pingMs === null) return { slug, state: 'unhealthy', pingMs: null };
  const instance = { slug, id: (await execDocker(['inspect', '--format', '{{.Id}}', container])).slice(0, 64), container, network, volume: names(slug).volume, ip, port: gamePort, state: 'running', pingMs, startedAt: Date.now() };
  instances.set(slug, instance);
  return instance;
}
async function proxyHttp(req, res, slug, url) {
  // Avoid invoking the Docker CLI on every asset/API request; a cached instance is refreshed
  // through the status endpoint and on the next start attempt.
  const instance = instances.get(slug) || await statusOne(slug);
  if (instance.state !== 'running') return sendJson(res, 503, { error: 'Game runtime is not running.' });
  const marker = `/v1/games/${slug}/proxy`;
  let upstreamPath = url.pathname.slice(marker.length) || '/';
  if (!upstreamPath.startsWith('/')) upstreamPath = `/${upstreamPath}`;
  upstreamPath += url.search;
  const gamePort = Number(instance.port) || 3000;
  const headers = { ...req.headers, host: `${instance.ip}:${gamePort}`, 'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host || '', 'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http' };
  for (const key of ['content-length', 'cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'x-runtime-token', 'origin', 'referer', 'host']) delete headers[key];
  headers.host = `${instance.ip}:${gamePort}`;
  const upstream = http.request({ hostname: instance.ip, port: gamePort, method: req.method, path: upstreamPath, headers, timeout: 15000 }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Game runtime timed out.')));
  upstream.on('error', error => { if (!res.headersSent) sendJson(res, 502, { error: `Game runtime proxy failed: ${error.message}` }); else res.destroy(error); });
  req.pipe(upstream);
}
async function proxyUpgrade(req, socket, head, slug, url) {
  const instance = instances.get(slug) || await statusOne(slug);
  if (instance.state !== 'running') return socket.destroy();
  const marker = `/v1/games/${slug}/proxy`;
  let upstreamPath = url.pathname.slice(marker.length) || '/';
  if (!upstreamPath.startsWith('/')) upstreamPath = `/${upstreamPath}`;
  upstreamPath += url.search;
  const gamePort = Number(instance.port) || 3000;
  const upstream = net.connect(gamePort, instance.ip);
  upstream.on('connect', () => {
    const lines = [`${req.method} ${upstreamPath} HTTP/${req.httpVersion}`];
    const raw = req.rawHeaders || [];
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i]; const key = name.toLowerCase();
      if (key === 'host') lines.push(`Host: ${instance.ip}:${gamePort}`);
      else if (!['cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'x-runtime-token', 'origin', 'referer'].includes(key)) lines.push(`${name}: ${raw[i + 1]}`);
    }
    if (!raw.some((v, i) => i % 2 === 0 && v.toLowerCase() === 'host')) lines.push(`Host: ${instance.ip}:${gamePort}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://runtime.internal');
  if (url.pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'game-runtime' });
  if (!authorized(req)) return sendJson(res, 401, { error: 'Unauthorized runtime request.' });
  try {
    let match = url.pathname.match(/^\/v1\/games\/([a-z0-9-]+)\/(start|stop|status)$/);
    if (match && req.method === 'POST' && match[2] === 'start') return sendJson(res, 200, await ensureRunning(match[1]));
    if (match && req.method === 'POST' && match[2] === 'stop') return sendJson(res, 200, await stopOne(match[1]));
    if (match && req.method === 'GET' && match[2] === 'status') return sendJson(res, 200, await statusOne(match[1]));
    if (url.pathname === '/v1/games/stop-all' && req.method === 'POST') {
      const namesOutput = await execDocker(['ps', '-a', '--format', '{{.Names}}', '--filter', 'name=^scgame-']);
      const slugs = namesOutput.split(/\r?\n/).map(name => name.trim()).filter(name => /^scgame-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)).map(name => name.slice('scgame-'.length));
      const results = await Promise.all(slugs.map(slug => stopOne(slug).catch(error => ({ slug, error: error.message }))));
      return sendJson(res, 200, { ok: true, stopped: results.length, results });
    }
    match = url.pathname.match(/^\/v1\/games\/([a-z0-9-]+)\/proxy(?:\/.*)?$/);
    if (match) return await proxyHttp(req, res, match[1], url);
    return sendJson(res, 404, { error: 'Runtime endpoint not found.' });
  } catch (error) {
    console.error(`[game-runtime] ${req.method} ${url.pathname}: ${error.stack || error.message}`);
    return sendJson(res, 503, { error: 'Game runtime operation failed.', detail: process.env.NODE_ENV === 'development' ? String(error.message || error).slice(0, 2600) : undefined });
  }
}

function primaryIPv4() {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (!/^eth0$|^en0$|^ens\d+$/.test(name)) continue;
    const entry = (list || []).find(value => (value.family === 'IPv4' || value.family === 4) && !value.internal);
    if (entry) return entry.address;
  }
  for (const list of Object.values(os.networkInterfaces())) {
    const entry = (list || []).find(value => (value.family === 'IPv4' || value.family === 4) && !value.internal);
    if (entry) return entry.address;
  }
  return '0.0.0.0';
}
const listenHost = process.env.SERVER_GAME_RUNTIME_LISTEN_HOST || primaryIPv4();
const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url || '/', 'http://runtime.internal');
  res.once('finish', () => console.log(`[game-runtime] ${req.method} ${url.pathname} -> ${res.statusCode} ${Date.now() - startedAt}ms`));
  handler(req, res).catch(error => {
    console.error(`[game-runtime] ${req.method} ${url.pathname}: ${error.stack || error.message}`);
    if (!res.headersSent) sendJson(res, 503, { error: 'Game runtime operation failed.', detail: process.env.NODE_ENV === 'development' ? String(error.message || error).slice(0, 2600) : undefined });
    else res.destroy(error);
  });
});
// Node's HTTP parser can reject malformed/incomplete requests before handler() is reached.
// Log that case explicitly; otherwise it appears to clients as HTTP 400 with no app log.
server.on('clientError', (error, socket) => {
  console.error(`[game-runtime] HTTP parser rejected request: ${error.code || 'UNKNOWN'}: ${error.message}`);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://runtime.internal');
  const match = url.pathname.match(/^\/v1\/games\/([a-z0-9-]+)\/proxy(?:\/.*)?$/);
  if (!match || !authorized(req)) return socket.destroy();
  proxyUpgrade(req, socket, head, match[1], url).catch(() => socket.destroy());
});
server.listen(port, listenHost, () => console.log(`Game runtime manager listening on ${listenHost}:${port}`));
