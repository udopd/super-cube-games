import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import imageSizePackage from 'image-size';
import nodemailer from 'nodemailer';
import { createDatabase } from './src/db.js';
import { DataApiSessionStore } from './shared/data-api-session-store.js';
import { registerAuthRoutes } from './src/auth.js';
import { passwordHash, verifyPassword } from './src/passwords.js';
import { csrfToken, csrfGuard, escapeHtml, normalizeTags } from './src/security.js';
import { createDraftFromZip, replaceCapsule, getGameBySlug, parseGame, gamePublicShape, GameArchiveError } from './src/games.js';
import { recordGameEvent, classifySource, createPlaySession, touchPlaySession, getGameMetrics, getCatalogGames, getAdminGames, getPlayerSummary, getPublicLeaderboard, getAdminLeaderboard, getPlatformMetrics, recordPlatformSnapshot } from './src/analytics.js';
import { ensureServerGame, proxyServerGame, proxyServerGameUpgrade, serverGameStatus, stopServerGame, stopAllServerGames } from './src/server-game-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const baseUrl = String(env.BASE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : `http://localhost:${env.PORT || 3000}`)).replace(/\/$/, '');
const storageDir = path.resolve(__dirname, env.STORAGE_DIR || './storage');
const publicDir = path.join(__dirname, 'public');
const gamesDir = path.join(storageDir, 'games');
const avatarsDir = path.join(storageDir, 'avatars');
const imageSize = imageSizePackage.imageSize || imageSizePackage.default || imageSizePackage;
await fsp.mkdir(storageDir, { recursive: true });
await fsp.mkdir(gamesDir, { recursive: true });
await fsp.mkdir(avatarsDir, { recursive: true });
if (env.NODE_ENV === 'production' && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-'))) {
  throw new Error('Set a strong SESSION_SECRET (at least 32 characters) before production startup.');
}
if (!env.SESSION_SECRET) console.warn('[config] SESSION_SECRET is not set; using a development-only random secret. Sessions will not survive restarts.');

const db = createDatabase();
async function waitForDataApi(timeoutMs = Number(env.DATA_API_STARTUP_TIMEOUT_MS || 30000)) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    if (await db.health()) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(500 + attempts * 250, 1500)));
  }
  throw new Error(`Data API is not healthy at ${env.DATA_API_URL || 'http://127.0.0.1:4001'}. Start PostgreSQL and the Data API first, or use docker compose up --build. Start-up wait: ${timeoutMs} ms.`);
}
await waitForDataApi();
const app = express();
const recentPlatformErrors = [];
const sessionStore = new DataApiSessionStore(db);
if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(async (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (req.path.startsWith('/game-files/')) res.setHeader('Cache-Control', 'private, no-store');
  next();
});
app.get('/health', async (_req, res) => {
  const ok = await db.health();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', dataApi: ok ? 'connected' : 'unavailable' });
});
// Preserve request bytes for the isolated server-game reverse proxy. express.json()
// consumes the incoming stream before route handlers run; proxying req.pipe() afterwards
// would otherwise forward an empty body while retaining the original Content-Length.
const captureRawBody = (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); };
app.use(express.json({ limit: '300kb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: false, limit: '24kb', verify: captureRawBody }));
app.use(session({
  name: 'scgames.sid',
  store: sessionStore,
  secret: env.SESSION_SECRET || crypto.randomBytes(48).toString('hex'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14, path: '/' }
}));

const globalLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please retry in a few minutes.' } });
const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please wait 1 minute.' } });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Upload limit reached. Try again later.' } });
app.use('/api', globalLimiter);
app.use('/auth', globalLimiter);
app.use(async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/')) return csrfGuard(req, res, next);
  next();
});

const archiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 10 } });
const capsuleUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 2 } });
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2 } });

async function getUser(req) {
  if (!req.session?.userId) return null;
  const user = await db.prepare('SELECT id,public_id,email,display_name,avatar_url,email_verified,created_at,last_login_at FROM users WHERE id=?').get(req.session.userId);
  if (!user) return null;
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  return { ...user, isAdmin: Boolean(adminEmail && user.email.toLowerCase() === adminEmail && user.email_verified === 1) };
}
async function requireUser(req, res, next) {
  req.user = await getUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please sign in first.', login: '/login.html' });
  next();
}
async function requireAdmin(req, res, next) {
  req.user = await getUser(req);
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}
function ensurePublished(game, res) {
  if (!game || game.status !== 'published') { res.status(404).json({ error: 'Game not found.' }); return false; }
  return true;
}
function safeGuestId(value) {
  const input = String(value || '');
  return /^[A-Za-z0-9_-]{8,100}$/.test(input) ? input : crypto.randomUUID();
}
function signTestPreview(userId, slug) {
  const payload = Buffer.from(JSON.stringify({ userId, slug, expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const secret = env.SESSION_SECRET || 'development-only-test-secret';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyTestPreview(req, slug, cookiePrefix = 'scgames_test_') {
  const cookieName = `${cookiePrefix}${slug}`;
  const cookieHeader = String(req.headers.cookie || '');
  const encoded = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!encoded) return false;
  const [payload, signature] = decodeURIComponent(encoded).split('.');
  if (!payload || !signature) return false;
  const secret = env.SESSION_SECRET || 'development-only-test-secret';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let given;
  try { given = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.slug === slug && Number(data.expiresAt) > Date.now() && Number.isInteger(Number(data.userId));
  } catch { return false; }
}
function csrfFromSession(req) { return csrfToken(req); }
function apiError(error, res) {
  if (error instanceof GameArchiveError) return res.status(error.status || 400).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}

async function publicGameDetails(game, lang = 'ru') {
  const language = lang === 'en' ? 'en' : 'ru';
  const publicPath = (relative) => `/game-files/${encodeURIComponent(game.slug)}/${String(relative).split('/').map(encodeURIComponent).join('/')}`;
  const root = path.join(gamesDir, game.slug, 'media');
  const files = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  const imageExt = /\.(png|jpe?g|gif|webp|avif)$/i;
  const capsuleUrl = publicPath(game.capsule_path);
  const promo = files.filter((f) => f.isFile() && imageExt.test(f.name)).map((f) => publicPath(`media/${f.name}`)).filter((url) => url !== capsuleUrl);
  const screenshots = await fsp.readdir(path.join(root, 'screenshots'), { withFileTypes: true }).catch(() => []);
  const shots = screenshots.filter((f) => f.isFile() && imageExt.test(f.name)).map((f) => publicPath(`media/screenshots/${f.name}`));
  const [rating, reviewsCount] = await Promise.all([
    db.prepare('SELECT ROUND(AVG(rating),2) AS avg,COUNT(*) AS count FROM ratings WHERE game_id=?').get(game.id),
    db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE game_id=? AND parent_id IS NULL').get(game.id)
  ]);
  const tags = JSON.parse(game.tags_en_json || game.tags_json || '[]').map((tag) => String(tag).toLowerCase());
  return { slug: game.slug, status: game.status, title: game.title, description: (language === 'en' ? game.description_en : game.description_ru) || game.description,
    descriptionRu: game.description_ru || game.description, descriptionEn: game.description_en || game.description,
    tags, capsule: capsuleUrl, promo, screenshots: shots,
    minPlayers: game.min_players, maxPlayers: game.max_players, runtimeType: game.runtime_type || 'browser',
    averageRating: Number(rating?.avg || 0), ratingsCount: Number(rating?.count || 0), reviewsCount: Number(reviewsCount?.n || 0) };
}
function sanitizeEmailHtml(value) {
  return String(value || '').slice(0, 12000)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<(?!\/?(?:p|br|strong|b|em|i|ul|ol|li|a|h2|h3)(?:\s|>|\/))[^>]*>/gi, '');
}

// The isolated server-game iframe is sandboxed (opaque origin). Allow CORS only for its public runtime proxy paths;
// ordinary write APIs still require same-origin plus CSRF. Server-game APIs expose game actions, never platform sessions.
app.use(async (req, res, next) => {
  const runtimeApi = /^\/server-games(?:-test)?\/[a-z0-9-]+\/api(?:\/|$)/i.test(req.path);
  if (runtimeApi) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    if (origin === 'null' && runtimeApi) return next();
    try {
      if (new URL(origin).origin !== new URL(baseUrl).origin) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    } catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
  }
  next();
});

registerAuthRoutes(app, { db, env, authLimiter });

// Session bootstrap and authentication state.
app.get('/api/bootstrap', async (req, res) => {
  const user = await getUser(req);
  res.json({
    csrfToken: csrfFromSession(req),
    user: user ? { id: user.id, playerId: user.public_id, email: user.email, name: user.display_name, avatar: user.avatar_url, isAdmin: user.isAdmin } : null,
    providers: { email: Boolean(env.SMTP_HOST) || env.NODE_ENV !== 'production' }
  });
});

app.get('/api/games', async (req, res) => {
  try {
    const games = await getCatalogGames(db, req.query);
    const user = await getUser(req);
    if (user) {
      const favorites = new Set((await db.prepare('SELECT game_id FROM favorites WHERE user_id=?').all(user.id)).map((item) => Number(item.game_id)));
      for (const game of games) game.isFavorite = favorites.has(game.id);
      const rated = new Map((await db.prepare('SELECT game_id,rating FROM ratings WHERE user_id=?').all(user.id)).map((item) => [Number(item.game_id), Number(item.rating)]));
      for (const game of games) game.myRating = rated.get(game.id) || 0;
    }
    res.json({ games, tags: await allPublishedTags(String(req.query.lang || 'ru') === 'en' ? 'en' : 'ru') });
  } catch (error) { apiError(error, res); }
});
async function allPublishedTags() {
  const rows = await db.prepare("SELECT tags_en_json AS tags_json,tags_json AS legacy_tags FROM games WHERE status='published'").all();
  const tags = new Map();
  for (const row of rows) for (const rawTag of JSON.parse(row.tags_json || row.legacy_tags || '[]')) { const tag = String(rawTag).toLowerCase(); tags.set(tag, tag); }
  return [...tags.values()].sort((a,b) => a.localeCompare(b));
}
app.post('/api/events', async (req, res) => {
  const { slug, type } = req.body || {};
  const game = await getGameBySlug(db, String(slug || '').slice(0, 100));
  if (!game || game.status !== 'published') return res.status(404).json({ error: 'Game not found.' });
  if (!['catalog_click', 'game_click'].includes(type)) return res.status(400).json({ error: 'Unsupported event.' });
  const source = type === 'catalog_click' ? 'catalog' : classifySource(req, req.body.source);
  const user = await getUser(req);
  await recordGameEvent(db, { gameId: game.id, userId: user?.id || null, guestId: safeGuestId(req.body.guestId), type, source });
  res.json({ ok: true });
});

app.get('/api/games/:slug/details', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game || (game.status !== 'published' && !(await getUser(req))?.isAdmin)) return res.status(404).json({ error: 'Game not found.' });
  const details = await publicGameDetails(game, req.query.lang);
  const user = await getUser(req);
  const ratingRow = user ? await db.prepare('SELECT rating FROM ratings WHERE game_id=? AND user_id=?').get(game.id, user.id) : null;
  const ownRating = Number(ratingRow?.rating || 0);
  const favoriteRow = user ? await db.prepare('SELECT 1 FROM favorites WHERE game_id=? AND user_id=?').get(game.id, user.id) : null;
  const isFavorite = Boolean(favoriteRow);
  res.json({ game: details, currentUser: user ? { id: user.id, playerId: user.public_id, name: user.display_name, isAdmin: user.isAdmin } : null, ownRating, isFavorite });
});
async function reviewsForGame(gameId, user) {
  const rows = await db.prepare(`SELECT r.id,r.parent_id AS parentId,r.is_admin_reply AS isAdminReply,r.body,r.created_at AS createdAt,r.updated_at AS updatedAt,
      u.id AS userId,u.public_id AS playerId,u.display_name AS name,u.avatar_url AS avatar
    FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.game_id=? ORDER BY r.created_at ASC`).all(gameId);
  return rows.map((row) => { const { userId, ...publicRow } = row; return { ...publicRow, isOwner: Boolean(user && user.id === userId), canDelete: Boolean(user && (user.id === userId || user.isAdmin)), canEdit: Boolean(user && user.id === userId && !row.isAdminReply) }; });
}
app.get('/api/games/:slug/reviews', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  res.json({ reviews: await reviewsForGame(game.id, await getUser(req)) });
});
app.post('/api/games/:slug/rating', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be from 1 to 5.' });
  const timestamp = new Date().toISOString();
  await db.prepare(`INSERT INTO ratings(game_id,user_id,rating,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(game_id,user_id) DO UPDATE SET rating=excluded.rating,updated_at=excluded.updated_at`).run(game.id, req.user.id, rating, timestamp);
  await recordGameEvent(db, { gameId: game.id, userId: req.user.id, type: 'rating_submitted' });
  res.json({ ok: true, metrics: await getGameMetrics(db, game.id) });
});
app.post('/api/games/:slug/review', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const body = String(req.body?.body || '').trim();
  if (body.length < 3 || body.length > 2000) return res.status(400).json({ error: 'Review must be 3–2000 characters.' });
  const timestamp = new Date().toISOString();
  const result = await db.prepare('INSERT INTO reviews(game_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?)').run(game.id, req.user.id, body, timestamp, timestamp);
  await recordGameEvent(db, { gameId: game.id, userId: req.user.id, type: 'review_submitted', metadata: { reviewId: result.lastInsertRowid, length: body.length } });
  res.status(201).json({ ok: true, reviewId: result.lastInsertRowid, reviews: await reviewsForGame(game.id, req.user) });
});
app.patch('/api/games/:slug/reviews/:reviewId', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const review = await db.prepare('SELECT * FROM reviews WHERE id=? AND game_id=?').get(Number(req.params.reviewId), game.id);
  if (!review) return res.status(404).json({ error: 'Comment not found.' });
  if (review.user_id !== req.user.id || review.is_admin_reply) return res.status(403).json({ error: 'You can edit only your own comments.' });
  const body = String(req.body?.body || '').trim();
  if (body.length < 3 || body.length > 2000) return res.status(400).json({ error: 'Comment must be 3–2000 characters.' });
  await db.prepare('UPDATE reviews SET body=?,updated_at=? WHERE id=?').run(body, new Date().toISOString(), review.id);
  res.json({ ok: true, reviews: await reviewsForGame(game.id, req.user) });
});
app.delete('/api/games/:slug/reviews/:reviewId', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const review = await db.prepare('SELECT * FROM reviews WHERE id=? AND game_id=?').get(Number(req.params.reviewId), game.id);
  if (!review) return res.status(404).json({ error: 'Comment not found.' });
  if (review.user_id !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'You can delete only your own comments.' });
  await db.prepare('DELETE FROM reviews WHERE id=?').run(review.id);
  res.json({ ok: true, reviews: await reviewsForGame(game.id, req.user) });
});
app.post('/api/games/:slug/reviews/:reviewId/reply', requireAdmin, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const parent = await db.prepare('SELECT id FROM reviews WHERE id=? AND game_id=? AND parent_id IS NULL').get(Number(req.params.reviewId), game.id);
  if (!parent) return res.status(404).json({ error: 'Comment not found.' });
  const body = String(req.body?.body || '').trim();
  if (body.length < 1 || body.length > 2000) return res.status(400).json({ error: 'Reply must be 1–2000 characters.' });
  const timestamp = new Date().toISOString();
  await db.prepare('INSERT INTO reviews(game_id,user_id,parent_id,is_admin_reply,body,created_at,updated_at) VALUES(?,?,?,1,?,?,?)')
    .run(game.id, req.user.id, parent.id, body, timestamp, timestamp);
  await recordGameEvent(db, { gameId: game.id, userId: req.user.id, type: 'review_submitted', metadata: { adminReply: true, parentId: parent.id } });
  res.status(201).json({ ok: true, reviews: await reviewsForGame(game.id, req.user) });
});
app.post('/api/games/:slug/favorite', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const existing = await db.prepare('SELECT 1 FROM favorites WHERE game_id=? AND user_id=?').get(game.id, req.user.id);
  if (existing) {
    await db.prepare('DELETE FROM favorites WHERE game_id=? AND user_id=?').run(game.id, req.user.id);
    await recordGameEvent(db, { gameId: game.id, userId: req.user.id, type: 'favorite_removed' });
    return res.json({ ok: true, favorite: false });
  }
  await db.prepare('INSERT INTO favorites(game_id,user_id,created_at) VALUES(?,?,?)').run(game.id, req.user.id, new Date().toISOString());
  // Event-based scoring is one-time per game even if a player later removes it from favourites.
  if (!(await db.prepare("SELECT 1 FROM game_events WHERE game_id=? AND user_id=? AND event_type='favorite_added' LIMIT 1").get(game.id, req.user.id)))
    await recordGameEvent(db, { gameId: game.id, userId: req.user.id, type: 'favorite_added' });
  res.json({ ok: true, favorite: true });
});
app.post('/api/games/:slug/share', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const user = await getUser(req);
  const guestId = safeGuestId(req.body?.guestId);
  await recordGameEvent(db, { gameId: game.id, userId: user?.id || null, guestId, type: 'game_shared', source: 'internal' });
  res.json({ ok: true, url: `${baseUrl}/games/${encodeURIComponent(game.slug)}` });
});

// Runtime ping for cards and the game details modal. A missing container is warmed asynchronously.
app.get('/api/games/:slug/ping', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  const user = await getUser(req);
  if (!game || (game.status !== 'published' && !user?.isAdmin)) return res.status(404).json({ error: 'Game not found.' });
  if ((game.runtime_type || 'browser') !== 'server') return res.json({ runtimeType: 'browser', status: 'not-applicable', pingMs: null });
  try {
    const status = await serverGameStatus(game.slug);
    if (status.state === 'running') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ runtimeType: 'server', status: 'online', pingMs: status.pingMs ?? null });
    }
    ensureServerGame(game, gamesDir).catch((error) => console.warn(`[server-game:${game.slug}] auto-start failed: ${error.message}`));
    return res.status(202).json({ runtimeType: 'server', status: 'starting', pingMs: null });
  } catch (error) {
    console.warn(`[server-game:${game.slug}] ping failed: ${error.message}`);
    return res.status(503).json({ runtimeType: 'server', status: 'unavailable', pingMs: null });
  }
});

// Public scoring leaderboard intentionally returns only public player ID, nickname and points.
app.get('/api/leaderboard', async (req, res) => res.json({ players: await getPublicLeaderboard(db, req.query.limit) }));

// Player account settings. Avatar images are center-cropped and compacted in the browser before storage.
app.delete('/api/me/account', requireUser, async (req, res) => {
  const avatar = String(req.user.avatar_url || '').match(/^\/user-avatars\/(avatar-[a-f0-9]{36}\.(?:png|jpg|webp))$/i)?.[1];
  await db.prepare('DELETE FROM email_codes WHERE email=?').run(req.user.email);
  await db.prepare('DELETE FROM password_reset_tokens WHERE email=?').run(req.user.email);
  await db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  if (avatar) await fsp.rm(path.join(avatarsDir, avatar), { force: true }).catch(() => {});
  req.session.destroy((error) => { if (error) return res.status(500).json({ error: 'Account deleted, but the session could not be closed.' }); res.clearCookie('scgames.sid', { path: '/' }); res.json({ ok: true }); });
});
app.patch('/api/me/profile', requireUser, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 32) return res.status(400).json({ error: 'Nickname must be 2–32 characters.' });
  await db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name, req.user.id);
  res.json({ ok: true, name, playerId: req.user.public_id });
});
app.post('/api/me/avatar', requireUser, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an avatar image.' });
  let dims;
  try { dims = imageSize(req.file.buffer); } catch { return res.status(400).json({ error: 'Avatar is not a valid image.' }); }
  const type = String(dims.type || '').toLowerCase();
  if (dims.width !== 64 || dims.height !== 64 || !['png','jpg','jpeg','webp'].includes(type))
    return res.status(400).json({ error: 'Avatar must be a compact PNG, JPG or WebP image exactly 64 × 64 pixels. Select an image in the profile page so it can be cropped and resized safely.' });
  const ext = type === 'jpeg' ? 'jpg' : type;
  const filename = `avatar-${crypto.randomBytes(18).toString('hex')}.${ext}`;
  const destination = path.join(avatarsDir, filename);
  await fsp.writeFile(destination, req.file.buffer, { flag: 'wx', mode: 0o640 });
  const previous = String(req.user.avatar_url || '').match(/^\/user-avatars\/(avatar-[a-f0-9]{36}\.(?:png|jpg|webp))$/i)?.[1];
  await db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(`/user-avatars/${filename}`, req.user.id);
  if (previous) await fsp.rm(path.join(avatarsDir, previous), { force: true }).catch(() => {});
  res.json({ ok: true, avatar: `/user-avatars/${filename}` });
});
app.delete('/api/me/avatar', requireUser, async (req, res) => {
  const previous = String(req.user.avatar_url || '').match(/^\/user-avatars\/(avatar-[a-f0-9]{36}\.(?:png|jpg|webp))$/i)?.[1];
  await db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run('', req.user.id);
  if (previous) await fsp.rm(path.join(avatarsDir, previous), { force: true }).catch(() => {});
  res.json({ ok: true, avatar: '' });
});
app.get('/user-avatars/:filename', async (req, res) => {
  const filename = String(req.params.filename || '');
  if (!/^avatar-[a-f0-9]{36}\.(?:png|jpg|webp)$/i.test(filename)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(avatarsDir, filename), { dotfiles: 'deny' }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
});
app.post('/api/me/password', requireUser, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const row = await db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (row.password_hash && !verifyPassword(currentPassword, row.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (newPassword.length < 6 || newPassword.length > 128) return res.status(400).json({ error: 'Password must be 6–128 characters.' });
  await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(newPassword), req.user.id);
  res.json({ ok: true });
});
app.post('/api/auth/password', async (req, res) => {
  const login = String(req.body?.login || req.body?.email || '').trim().slice(0, 254);
  const password = String(req.body?.password || '');
  const adminLogin = String(env.ADMIN_LOGIN || '');
  const adminPassword = String(env.ADMIN_PASSWORD || '');
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const loginBytes = Buffer.from(login);
  const adminLoginBytes = Buffer.from(adminLogin);
  const passwordBytes = Buffer.from(password);
  const adminPasswordBytes = Buffer.from(adminPassword);
  const adminLoginMatches = adminLogin && loginBytes.length === adminLoginBytes.length && crypto.timingSafeEqual(loginBytes, adminLoginBytes);
  const adminPasswordMatches = adminPassword.length >= 12 && passwordBytes.length === adminPasswordBytes.length && crypto.timingSafeEqual(passwordBytes, adminPasswordBytes);
  let user;
  if (adminLoginMatches && adminPasswordMatches && adminEmail) {
    user = await db.prepare('SELECT id,password_hash,email_verified FROM users WHERE email=?').get(adminEmail);
    if (!user) {
      const timestamp = new Date().toISOString();
      try {
        const result = await db.prepare('INSERT INTO users(email, display_name, email_verified, created_at, last_login_at) VALUES(?,?,1,?,?)')
          .run(adminEmail, adminLogin, timestamp, timestamp);
        user = { id: Number(result.lastInsertRowid), email_verified: 1 };
      } catch (error) {
        if (error?.code !== '23505') throw error;
        user = await db.prepare('SELECT id,password_hash,email_verified FROM users WHERE email=?').get(adminEmail);
      }
    }
    if (user && user.email_verified !== 1) {
      await db.prepare('UPDATE users SET email_verified=1, last_login_at=? WHERE id=?').run(new Date().toISOString(), user.id);
      user.email_verified = 1;
    }
  } else {
    user = await db.prepare('SELECT id,password_hash,email_verified FROM users WHERE email=?').get(login.toLowerCase());
    if (!user || !user.email_verified || !verifyPassword(password, user.password_hash)) user = null;
  }
  const authenticatedWithEnvCredentials = Boolean(adminLoginMatches && adminPasswordMatches && adminEmail);
  if (!user || !user.email_verified || (!authenticatedWithEnvCredentials && !verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Login or password is incorrect.' });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Could not create a session.' });
    req.session.userId = user.id;
    const isAdminAccount = authenticatedWithEnvCredentials || Boolean(adminEmail && login.toLowerCase() === adminEmail);
    const redirect = isAdminAccount ? '/admin.html' : '/profile.html';
    req.session.save((saveError) => saveError ? res.status(500).json({ error: 'Could not save the session.' }) : res.json({ ok: true, redirect }));
  });
});

app.get('/api/admin/monitoring', requireAdmin, async (req, res) => {
  const games = await db.prepare("SELECT id,slug,title,status,runtime_type,updated_at FROM games ORDER BY title ASC").all();
  const serverGames = await Promise.all(games.filter(g => g.runtime_type === 'server').map(async g => {
    try { return { slug:g.slug,title:g.title,status:g.status,...await serverGameStatus(g.slug) }; }
    catch (error) { return { slug:g.slug,title:g.title,status:g.status,runtimeStatus:'error',error:String(error.message||error).slice(0,300) }; }
  }));
  const recentEvents = await db.prepare(`SELECT e.created_at AS createdAt,e.event_type AS eventType,e.source,g.slug,g.title FROM game_events e LEFT JOIN games g ON g.id=e.game_id ORDER BY e.created_at DESC LIMIT 100`).all();
  const eventErrors = recentEvents.filter((event) => /error|fail|crash|exception/i.test(String(event.eventType || ''))).slice(0, 30).map((event) => ({ scope: 'game', at: event.createdAt, title: event.title || event.slug || 'Game event', message: String(event.eventType || 'error'), path: event.slug || '', source: event.source || '' }));
  const runtimeErrors = serverGames.filter((game) => game.runtimeStatus === 'error' || game.error).map((game) => ({ scope: 'game-runtime', at: new Date().toISOString(), title: game.title, message: String(game.error || game.runtimeStatus || 'Runtime error').slice(0, 600), path: game.slug, status: game.status }));
  const errors = [...runtimeErrors, ...eventErrors, ...recentPlatformErrors].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 100);
  res.json({ checkedAt:new Date().toISOString(), platform:{status:'online',uptimeSeconds:Math.floor(process.uptime()),memoryBytes:process.memoryUsage().rss},serverGames, recentEvents, errors });
});
app.get('/api/admin/metrics', requireAdmin, async (req, res) => res.json(await getPlatformMetrics(db)));
app.get('/api/admin/leaderboard', requireAdmin, async (req, res) => res.json({ players: await getAdminLeaderboard(db, req.query.limit) }));
app.get('/api/admin/players', requireAdmin, async (req, res) => {
  const players = await getAdminLeaderboard(db, 100000);
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  res.json({ players: players.filter((player) => player.email.toLowerCase() !== adminEmail) });
});
app.get('/api/admin/players/:id', requireAdmin, async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isSafeInteger(playerId) || playerId < 1) return res.status(400).json({ error: 'Invalid player ID.' });
  const user = await db.prepare('SELECT id,public_id,email,display_name,avatar_url,email_verified,created_at,last_login_at FROM users WHERE id=?').get(playerId);
  if (!user) return res.status(404).json({ error: 'Player not found.' });
  const totals = await db.prepare('SELECT COUNT(*) AS sessions,COALESCE(SUM(duration_seconds),0) AS seconds,COUNT(DISTINCT game_id) AS games FROM play_sessions WHERE user_id=?').get(playerId);
  const games = await db.prepare(`SELECT g.title,g.slug,SUM(p.duration_seconds) AS seconds,COUNT(*) AS sessions,MAX(p.started_at) AS lastPlayed
    FROM play_sessions p JOIN games g ON g.id=p.game_id WHERE p.user_id=? GROUP BY g.id ORDER BY seconds DESC`).all(playerId);
  const sessions = await db.prepare(`SELECT g.title,g.slug,p.started_at AS startedAt,p.ended_at AS endedAt,p.last_seen_at AS lastSeenAt,p.duration_seconds AS seconds,p.source,p.is_active AS active
    FROM play_sessions p JOIN games g ON g.id=p.game_id WHERE p.user_id=? ORDER BY p.started_at DESC`).all(playerId);
  const reviews = await db.prepare(`SELECT r.id,r.parent_id AS parentId,r.is_admin_reply AS isAdminReply,r.body,r.created_at AS createdAt,r.updated_at AS updatedAt,g.title,g.slug
    FROM reviews r JOIN games g ON g.id=r.game_id WHERE r.user_id=? ORDER BY r.created_at DESC`).all(playerId);
  const ratings = await db.prepare(`SELECT g.title,g.slug,r.rating,r.updated_at AS updatedAt FROM ratings r JOIN games g ON g.id=r.game_id WHERE r.user_id=? ORDER BY r.updated_at DESC`).all(playerId);
  const favoriteGames = await db.prepare(`SELECT g.title,g.slug,f.created_at AS addedAt FROM favorites f JOIN games g ON g.id=f.game_id WHERE f.user_id=? ORDER BY f.created_at DESC`).all(playerId);
  const saves = await db.prepare(`SELECT g.title,g.slug,s.data_json AS data,s.updated_at AS updatedAt FROM cloud_saves s JOIN games g ON g.id=s.game_id WHERE s.user_id=? ORDER BY s.updated_at DESC`).all(playerId);
  const events = await db.prepare(`SELECT g.title,g.slug,e.event_type AS eventType,e.source,e.metadata_json AS metadata,e.created_at AS createdAt
    FROM game_events e JOIN games g ON g.id=e.game_id WHERE e.user_id=? ORDER BY e.created_at DESC`).all(playerId);
  const score = (await getAdminLeaderboard(db, 100000)).find((player) => player.id === playerId);
  const sharedGames = await db.prepare(`SELECT g.title,g.slug,COUNT(*) AS shareEvents,MAX(e.created_at) AS lastShared
    FROM game_events e JOIN games g ON g.id=e.game_id
    WHERE e.user_id=? AND e.event_type='game_shared'
    GROUP BY g.id ORDER BY lastShared DESC`).all(playerId);
  res.json({ user: { ...user, isAdmin: user.email.toLowerCase() === String(env.ADMIN_EMAIL || '').trim().toLowerCase() }, totals, games, sessions, reviewEntries: reviews, ratings, favoriteGames, events: events.map((event) => ({ ...event, metadata: (() => { try { return JSON.parse(event.metadata); } catch { return null; } })() })), cloudSaves: saves.map((save) => ({ ...save, data: (() => { try { return JSON.parse(save.data); } catch { return null; } })() })), sharedGames, score: score || null,
    reviews: Number((await db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id=? AND parent_id IS NULL').get(playerId))?.n || 0),
    favorites: Number((await db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id=?').get(playerId))?.n || 0),
    saves: Number((await db.prepare('SELECT COUNT(*) AS n FROM cloud_saves WHERE user_id=?').get(playerId))?.n || 0) });
});
app.delete('/api/admin/players/:id', requireAdmin, async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isSafeInteger(playerId) || playerId < 1) return res.status(400).json({ error: 'Invalid player ID.' });
  if (playerId === req.user.id) return res.status(403).json({ error: 'Administrators cannot delete their own account here.' });
  const player = await db.prepare('SELECT id,email,avatar_url FROM users WHERE id=?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (player.email.toLowerCase() === String(env.ADMIN_EMAIL || '').trim().toLowerCase()) return res.status(403).json({ error: 'The configured administrator account cannot be deleted.' });
  const avatar = String(player.avatar_url || '').match(/^\/user-avatars\/(avatar-[a-f0-9]{36}\.(?:png|jpg|webp))$/i)?.[1];
  await db.prepare('DELETE FROM email_codes WHERE email=?').run(player.email);
  await db.prepare('DELETE FROM users WHERE id=?').run(playerId);
  if (avatar) await fsp.rm(path.join(avatarsDir, avatar), { force: true }).catch(() => {});
  res.json({ ok: true });
});
app.post('/api/admin/players/:id/email', requireAdmin, async (req, res) => {
  const user = await db.prepare('SELECT email,display_name FROM users WHERE id=?').get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Player not found.' });
  if (!env.SMTP_HOST || !env.SMTP_FROM) return res.status(503).json({ error: 'Email is unavailable until SMTP is configured.' });
  const subject = String(req.body?.subject || '').trim().slice(0, 160);
  const bodyHtml = sanitizeEmailHtml(req.body?.html || '');
  if (!subject || !bodyHtml || bodyHtml.replace(/<[^>]+>/g, '').trim().length < 1) return res.status(400).json({ error: 'Add an email subject and message.' });
  const secure = String(env.SMTP_SECURE).toLowerCase() === 'true';
  try {
    const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure, requireTLS: !secure, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
    await transport.sendMail({ from: env.SMTP_FROM, to: user.email, subject, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:640px;margin:auto"><div style="font-weight:800;letter-spacing:.08em;margin-bottom:24px">SUPER CUBE</div>${bodyHtml}<hr style="border:0;border-top:1px solid #ddd;margin-top:32px"><small style="color:#777">Message from SUPER CUBE Games.</small></div>`, text: bodyHtml.replace(/<\/(p|li|h[2-3])>/gi, '\n').replace(/<[^>]+>/g, '') });
    res.json({ ok: true });
  } catch (error) { console.error(`[mail] admin message failed (${error.code || 'SMTP_ERROR'}) at ${env.SMTP_HOST}:${env.SMTP_PORT || 587}:`, error.message); res.status(502).json({ error: 'Email delivery failed. Check SMTP settings.' }); }
});

// Player profile and cloud-save APIs.
app.get('/api/me/summary', requireUser, async (req, res) => {
  if (req.user.isAdmin) return res.status(403).json({ error: 'The administrator uses the admin workspace, not the player cabinet.' });
  res.json({ user: { id: req.user.id, playerId: req.user.public_id, email: req.user.email, name: req.user.display_name, avatar: req.user.avatar_url }, ...await getPlayerSummary(db, req.user.id) });
});
app.get('/api/me/favorites', requireUser, async (req, res) => {
  if (req.user.isAdmin) return res.status(403).json({ error: 'Favorites are available to player accounts only.' });
  const { favorites } = await getPlayerSummary(db, req.user.id);
  res.json({ games: favorites });
});
app.get('/api/games/:slug/save', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const row = await db.prepare('SELECT data_json,updated_at FROM cloud_saves WHERE game_id=? AND user_id=?').get(game.id, req.user.id);
  res.json({ save: row ? JSON.parse(row.data_json) : null, updatedAt: row?.updated_at || null });
});
app.post('/api/games/:slug/save', requireUser, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!ensurePublished(game, res)) return;
  const json = JSON.stringify(req.body?.data ?? null);
  if (json.length > 250 * 1024) return res.status(413).json({ error: 'Cloud save must be smaller than 250 KB.' });
  const timestamp = new Date().toISOString();
  await db.prepare(`INSERT INTO cloud_saves(game_id,user_id,data_json,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(game_id,user_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`).run(game.id, req.user.id, json, timestamp);
  res.json({ ok: true, updatedAt: timestamp });
});

// SDK analytics sessions. A random guest key supports anonymous play counts without requiring an account.
app.post('/api/sdk/session/start', async (req, res) => {
  const slug = String(req.body?.slug || '').slice(0, 100);
  const game = await getGameBySlug(db, slug);
  if (!game || game.status !== 'published') return res.status(404).json({ error: 'Published game not found.' });
  const guestId = safeGuestId(req.body?.guestId);
  const source = classifySource(req, req.body?.source || 'direct');
  const user = await getUser(req);
  const sessionInfo = await createPlaySession(db, { gameId: game.id, userId: user?.id || null, guestId, source });
  res.json({ ...sessionInfo, guestId, metrics: await getGameMetrics(db, game.id) });
});
app.post('/api/sdk/session/heartbeat', async (req, res) => {
  const id = String(req.body?.sessionId || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid session.' });
  const user = await getUser(req);
  const result = await touchPlaySession(db, { id, userId: user?.id || null, guestId: safeGuestId(req.body?.guestId), active: req.body?.active === true });
  if (!result) return res.status(404).json({ error: 'Session not found.' });
  res.json({ ok: true, durationSeconds: result.durationSeconds, addedSeconds: result.addedSeconds });
});
app.post('/api/sdk/session/end', async (req, res) => {
  const id = String(req.body?.sessionId || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid session.' });
  const user = await getUser(req);
  const result = await touchPlaySession(db, { id, userId: user?.id || null, guestId: safeGuestId(req.body?.guestId), end: true, active: req.body?.active === true });
  if (!result) return res.status(404).json({ error: 'Session not found.' });
  res.json({ ok: true, durationSeconds: result.durationSeconds });
});
app.post('/api/sdk/event', async (req, res) => {
  const game = await getGameBySlug(db, String(req.body?.slug || '').slice(0,100));
  if (!game || game.status !== 'published') return res.status(404).json({ error: 'Published game not found.' });
  const type = String(req.body?.type || '');
  if (!['game_click', 'custom_click', 'level_start', 'level_complete'].includes(type)) return res.status(400).json({ error: 'Unsupported event.' });
  const user = await getUser(req);
  await recordGameEvent(db, { gameId: game.id, userId: user?.id || null, guestId: safeGuestId(req.body?.guestId), type, source: 'direct', metadata: { label: String(req.body?.label || '').slice(0, 80) } });
  res.json({ ok: true });
});

// Administrator endpoints — every handler is protected server-side, not only hidden in the UI.
app.get('/api/admin/summary', requireAdmin, async (req, res) => res.json(await getPlatformMetrics(db)));
app.get('/api/admin/games', requireAdmin, async (req, res) => res.json({ games: await getAdminGames(db) }));
app.post('/api/admin/games/:slug/update', requireAdmin, uploadLimiter, archiveUpload.single('archive'), async (req, res) => {
  const current = await getGameBySlug(db, req.params.slug);
  if (!current) return res.status(404).json({ error: 'Game not found.' });
  if (!req.file || !/\.zip$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Choose a ZIP archive first.' });
  let staged = null;
  const gameRoot = path.join(gamesDir, current.slug);
  const backupRoot = path.join(storageDir, 'tmp', `backup-${current.slug}-${Date.now()}`);
  try {
    staged = await createDraftFromZip({ db, zipBuffer: req.file.buffer, storageDir });
    const stagedRoot = path.join(gamesDir, staged.slug);
    // Keep the existing game id/slug/status: saves, ratings, reviews, favorites, and analytics remain attached.
    await fsp.rename(gameRoot, backupRoot);
    try {
      await fsp.rename(stagedRoot, gameRoot);
      await db.prepare(`UPDATE games SET title=?,description=?,tags_json=?,capsule_path=?,entry_path=?,favicon_path=?,description_ru=?,description_en=?,tags_ru_json=?,tags_en_json=?,runtime_type=?,archive_bytes=?,updated_at=? WHERE id=?`)
        .run(staged.title, staged.description, staged.tags_json, staged.capsule_path, staged.entry_path, staged.favicon_path, staged.description_ru, staged.description_en, staged.tags_ru_json, staged.tags_en_json, staged.runtime_type, req.file.buffer.length, new Date().toISOString(), current.id);
      await db.prepare('DELETE FROM games WHERE id=?').run(staged.id);
      await fsp.rm(backupRoot, { recursive: true, force: true });
    } catch (error) {
      await fsp.rm(gameRoot, { recursive: true, force: true }).catch(() => {});
      await fsp.rename(backupRoot, gameRoot).catch(() => {});
      throw error;
    }
    if ((current.runtime_type || 'browser') === 'server' || staged.runtime_type === 'server') {
      await stopServerGame(current.slug).catch(() => {});
      if (current.status === 'published' && staged.runtime_type === 'server') await ensureServerGame({ ...current, ...staged, id: current.id, slug: current.slug, status: current.status }, gamesDir).catch((error) => console.warn(`[server-game:${current.slug}] restart after update failed: ${error.message}`));
    }
    res.json({ ok: true, game: (await getAdminGames(db)).find((item) => item.slug === current.slug), preserved: ['saves','ratings','reviews','favorites','player statistics'] });
  } catch (error) {
    if (staged) {
      await db.prepare('DELETE FROM games WHERE id=?').run(staged.id).catch(() => {});
      await fsp.rm(path.join(gamesDir, staged.slug), { recursive: true, force: true }).catch(() => {});
    }
    apiError(error, res);
  }
});

app.post('/api/admin/games/upload', requireAdmin, uploadLimiter, archiveUpload.single('archive'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a ZIP archive first.' });
  if (!/\.zip$/i.test(req.file.originalname)) return res.status(400).json({ error: 'The uploaded file must have a .zip extension.' });
  try {
    const game = await createDraftFromZip({ db, zipBuffer: req.file.buffer, storageDir });
    res.status(201).json({ ok: true, game: { slug: game.slug, title: game.title, archiveBytes: Number(game.archive_bytes || req.file.buffer.length), testUrl: `/games/${game.slug}-test` } });
  } catch (error) { apiError(error, res); }
});
app.patch('/api/admin/games/:slug', requireAdmin, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  const title = String(req.body?.title ?? game.title).trim();
  const descriptionRu = String(req.body?.descriptionRu ?? game.description_ru ?? game.description).trim();
  const descriptionEn = String(req.body?.descriptionEn ?? game.description_en ?? game.description).trim();
  const tagsRu = normalizeTags(req.body?.tagsRu ?? JSON.parse(game.tags_ru_json || game.tags_json || '[]'));
  const tagsEn = normalizeTags(req.body?.tagsEn ?? JSON.parse(game.tags_en_json || game.tags_json || '[]'));
  const minPlayers = Number(req.body?.minPlayers ?? game.min_players);
  const maxPlayers = Number(req.body?.maxPlayers ?? game.max_players);
  const runtimeType = String(req.body?.runtimeType ?? game.runtime_type ?? 'browser');
  if (!title || title.length > 120 || /[А-Яа-яЁё]/.test(title)) return res.status(400).json({ error: 'Game title must be English and 1–120 characters long.' });
  if (descriptionRu.length > 1600 || descriptionEn.length > 1600) return res.status(400).json({ error: 'Each localized description must be at most 1600 characters.' });
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers) || minPlayers < 1 || maxPlayers < minPlayers || maxPlayers > 100) return res.status(400).json({ error: 'Players must be between 1 and 100, and maximum must be at least minimum.' });
  if (!['browser','server'].includes(runtimeType)) return res.status(400).json({ error: 'Runtime type must be browser or server.' });
  if (runtimeType === 'server') {
    const stat = await fsp.stat(path.join(gamesDir, game.slug, 'server', 'index.js')).catch(() => null);
    if (!stat?.isFile()) return res.status(400).json({ error: 'Server runtime requires server/index.js in the uploaded archive.' });
  }
  // Normalize editable metadata into media/ so future exports keep the canonical archive layout.
  const gameMediaDir = path.join(gamesDir, game.slug, 'media');
  await fsp.mkdir(gameMediaDir, { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(gameMediaDir, 'title.txt'), title, 'utf8'),
    fsp.writeFile(path.join(gameMediaDir, 'description.ru.txt'), descriptionRu, 'utf8'),
    fsp.writeFile(path.join(gameMediaDir, 'description.en.txt'), descriptionEn, 'utf8'),
    fsp.writeFile(path.join(gameMediaDir, 'tags.ru.txt'), tagsRu.join(', '), 'utf8'),
    fsp.writeFile(path.join(gameMediaDir, 'tags.en.txt'), tagsEn.join(', '), 'utf8')
  ]);
  await db.prepare(`UPDATE games SET title=?,description=?,tags_json=?,min_players=?,max_players=?,description_ru=?,description_en=?,tags_ru_json=?,tags_en_json=?,runtime_type=?,updated_at=? WHERE id=?`)
    .run(title, descriptionEn || descriptionRu, JSON.stringify(tagsEn), minPlayers, maxPlayers, descriptionRu, descriptionEn, JSON.stringify(tagsRu), JSON.stringify(tagsEn), runtimeType, new Date().toISOString(), game.id);
  res.json({ ok: true, game: (await getAdminGames(db)).find((item) => item.slug === game.slug) });
});
app.post('/api/admin/games/:slug/capsule', requireAdmin, capsuleUpload.single('capsule'), async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG or GIF capsule.' });
  try {
    const relativePath = await replaceCapsule({ game, imageBuffer: req.file.buffer, storageDir });
    await db.prepare('UPDATE games SET capsule_path=?,updated_at=? WHERE id=?').run(relativePath, new Date().toISOString(), game.id);
    res.json({ ok: true, capsule: `/game-files/${game.slug}/${relativePath}` });
  } catch (error) { apiError(error, res); }
});
app.post('/api/admin/games/:slug/publish', requireAdmin, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  const timestamp = new Date().toISOString();
  await db.prepare("UPDATE games SET status='published',published_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, game.id);
  let runtimeWarning = '';
  if ((game.runtime_type || 'browser') === 'server') {
    try { await ensureServerGame({ ...game, status: 'published' }, gamesDir); }
    catch (error) { runtimeWarning = env.NODE_ENV === 'development' ? error.message : 'The game was published, but its container could not start. Check Docker runtime configuration.'; }
  }
  res.json({ ok: true, url: `/games/${game.slug}`, runtimeWarning });
});
app.post('/api/admin/games/:slug/unpublish', requireAdmin, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  await db.prepare("UPDATE games SET status='draft',published_at=NULL,updated_at=? WHERE id=?").run(new Date().toISOString(), game.id);
  await stopServerGame(game.slug).catch((error) => console.warn(`[server-game:${game.slug}] stop requested during unpublish but runtime manager is unavailable: ${error.message}`));
  res.json({ ok: true });
});
app.delete('/api/admin/games/:slug', requireAdmin, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  await db.prepare('DELETE FROM games WHERE id=?').run(game.id);
  await stopServerGame(game.slug).catch((error) => console.warn(`[server-game:${game.slug}] stop requested during delete but runtime manager is unavailable: ${error.message}`));
  await fsp.rm(path.join(gamesDir, game.slug), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// Secure serving for uploaded games. Draft files are never exposed to anonymous visitors.
app.get('/game-files/:slug/*', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).send('Game not found');
  if (game.status !== 'published' && !(await getUser(req))?.isAdmin && !verifyTestPreview(req, game.slug)) return res.status(404).send('Not found');
  // Game pages run in a sandboxed iframe with an opaque origin. The global
  // `same-site` CORP policy blocks their stylesheet/script requests even though
  // the assets are served from this platform, so explicitly allow game assets.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const relative = String(req.params[0] || game.entry_path || 'index.html').replace(/\\/g, '/');
  if (!relative || relative.startsWith('/') || relative.split('/').some((part) => part === '..' || part === '.')) return res.status(400).send('Invalid path');
  const base = path.resolve(gamesDir, game.slug);
  const target = path.resolve(base, ...relative.split('/'));
  if (!target.startsWith(base + path.sep)) return res.status(400).send('Invalid path');
  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile() || stat.size > 100 * 1024 * 1024) return res.status(404).send('Not found');
    if (/\.html?$/i.test(target)) {
      let html = await fsp.readFile(target, 'utf8');
      const sdk = `<script src="/js/game-sdk.js?slug=${encodeURIComponent(game.slug)}"></script>`;
      if (!html.includes('/js/game-sdk.js')) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${sdk}</head>`) : `${sdk}${html}`;
      res.type('html').send(html);
    } else {
      res.sendFile(target, { dotfiles: 'deny', acceptRanges: true }, (error) => { if (error && !res.headersSent) res.status(error.statusCode || 404).end(); });
    }
  } catch { res.status(404).send('Not found'); }
});

async function serveServerGame(slug, subpath, req, res, isTest = false) {
  const game = await getGameBySlug(db, slug);
  const user = await getUser(req);
  const previewAllowed = isTest && game?.status === 'draft' && (user?.isAdmin || verifyTestPreview(req, slug, 'scgames_runtime_test_'));
  if (!game || (isTest ? !previewAllowed : game.status !== 'published') || (game.runtime_type || 'browser') !== 'server') return res.status(404).send('Server game not found.');
  try {
    const instance = await ensureServerGame(game, gamesDir);
    proxyServerGame(req, res, instance, subpath || '', game.slug);
  } catch (error) {
    console.error(`[server-game:${slug}]`, error.message);
    res.status(503).type('text').send(`This server game is temporarily unavailable. ${env.NODE_ENV === 'development' ? error.message : 'Please try again later.'}`);
  }
}
// Handle the runtime root in-place. Redirecting /:slug to /:slug/ here loops because Express matches both forms by default.
app.all('/server-games-test/:slug', async (req, res) => serveServerGame(req.params.slug, '', req, res, true));
app.all('/server-games-test/:slug/*', async (req, res) => serveServerGame(req.params.slug, req.params[0] || '', req, res, true));
app.all('/server-games/:slug', async (req, res) => serveServerGame(req.params.slug, '', req, res));
app.all('/server-games/:slug/*', async (req, res) => serveServerGame(req.params.slug, req.params[0] || '', req, res));

function gamePageHtml(game, isTest = false, source = '') {
  const title = escapeHtml(`${game.title}${isTest ? ' — Test build' : ''} | SUPER CUBE Games`);
  const description = escapeHtml(game.description_en || game.description || `Play ${game.title} on SUPER CUBE Games.`);
  const canonical = `${baseUrl}/games/${game.slug}${isTest ? '-test' : ''}`;
  const capsuleUrl = `/game-files/${game.slug}/${game.capsule_path.split('/').map(encodeURIComponent).join('/')}`;
  const faviconUrl = game.favicon_path
    ? `/game-files/${encodeURIComponent(game.slug)}/${game.favicon_path.split('/').map(encodeURIComponent).join('/')}`
    : '/favicon.svg';
  const frameSrc = game.runtime_type === 'server'
    ? (isTest ? `/server-games-test/${encodeURIComponent(game.slug)}/` : `/server-games/${encodeURIComponent(game.slug)}/`)
    : `/game-files/${encodeURIComponent(game.slug)}/${encodeURIComponent(game.entry_path || 'index.html')}`;
  const structuredData = JSON.stringify({ '@context': 'https://schema.org', '@type': 'VideoGame', name: game.title, description: game.description_en || game.description, image: `${baseUrl}${capsuleUrl}`, url: canonical, applicationCategory: 'GameApplication', operatingSystem: 'Any', playMode: game.max_players > 1 ? 'MultiPlayer' : 'SinglePlayer', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><script>(()=>{try{const t=localStorage.getItem('supercube-theme');document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');const l=localStorage.getItem('supercube-lang');if(l==='ru'||l==='en')document.documentElement.lang=l;}catch{}})();</script><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><meta name="description" content="${description}"><link rel="icon" href="${escapeHtml(faviconUrl)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${escapeHtml(baseUrl + capsuleUrl)}"><script type="application/ld+json">${structuredData}</script><link rel="stylesheet" href="/css/style.css"><style>html,body{height:100%;overflow:hidden}body.game-page{margin:0;display:flex;flex-direction:column}.game-header{flex:0 0 auto}.game-stage{flex:1;min-height:0;display:flex;background:var(--bg)}.game-frame{display:block;border:0;width:100%;height:100%;min-height:0;background:#fff}.game-top-actions{display:flex;align-items:center;gap:10px}.back-game{font-size:12px;color:var(--muted);font-weight:700;text-decoration:none;padding:10px 12px;border:1px solid var(--line)}.back-game:hover{color:var(--text);border-color:var(--text)}.test-pill{font-size:10px;color:#b66316;font-weight:800}</style></head><body class="game-page ${isTest ? 'is-test' : ''}"><header class="topbar game-header"><div class="container topbar-inner"><a class="brand" href="/">SUPER CUBE</a><div class="game-top-actions">${isTest ? '<span class="test-pill">TEST BUILD · ADMIN ONLY</span>' : ''}<a class="back-game" href="/" id="gameBack" data-history-back data-i18n="backCatalog">← Назад</a><button class="control" id="languageToggle" type="button">RU</button><button class="control" id="themeToggle" type="button">◐</button></div></div></header><main class="game-stage"><iframe id="gameFrame" class="game-frame" title="${escapeHtml(game.title)}" src="${frameSrc}" sandbox="allow-scripts allow-forms allow-pointer-lock" allow="fullscreen" referrerpolicy="no-referrer"></iframe></main><script src="/js/common.js" defer></script><script>window.SC_GAME_SLUG='${encodeURIComponent(game.slug)}';</script><script src="/js/game-host.js?slug=${encodeURIComponent(game.slug)}&test=${isTest ? '1' : '0'}&source=${encodeURIComponent(source)}" defer></script></body></html>`;
}

app.get('/games/:slug-test', requireAdminPage, async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game) return res.status(404).sendFile(path.join(__dirname, '404.html'));
  // The iframe is deliberately sandboxed without allow-same-origin. A short-lived, game-scoped HttpOnly cookie lets its asset requests load draft files without granting the game access to the parent origin.
  const previewToken = signTestPreview(req.user.id, game.slug);
  const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 10 * 60 * 1000 };
  res.cookie(`scgames_test_${game.slug}`, previewToken, { ...cookieOptions, path: `/game-files/${game.slug}/` });
  if (game.runtime_type === 'server') res.cookie(`scgames_runtime_test_${game.slug}`, previewToken, { ...cookieOptions, path: `/server-games-test/${game.slug}/` });
  res.type('html').send(gamePageHtml(game, true));
});
async function requireAdminPage(req, res, next) {
  req.user = await getUser(req);
  if (!req.user?.isAdmin) return res.redirect('/login.html?error=admin');
  next();
}
app.get('/games/:slug', async (req, res) => {
  const game = await getGameBySlug(db, req.params.slug);
  if (!game || game.status !== 'published') return res.status(404).sendFile(path.join(__dirname, '404.html'));
  const source = classifySource(req, String(req.query.src || ''));
  const user = await getUser(req);
  await recordGameEvent(db, { gameId: game.id, userId: user?.id || null, guestId: safeGuestId(req.query.guestId), type: 'game_open', source });
  res.type('html').send(gamePageHtml(game, false, String(req.query.src || source || '')));
});

// Basic SEO endpoints are generated from the published catalogue.
app.get('/sitemap.xml', async (req, res) => {
  const games = await db.prepare("SELECT slug, updated_at, published_at FROM games WHERE status='published'").all();
  const urls = [`<url><loc>${escapeHtml(baseUrl)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  for (const game of games) urls.push(`<url><loc>${escapeHtml(baseUrl)}/games/${encodeURIComponent(game.slug)}</loc><lastmod>${new Date(game.updated_at).toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});
app.get('/robots.txt', async (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin/player\nDisallow: /profile.html\nDisallow: /favorites.html\nDisallow: /login.html\nDisallow: /reset-password.html\nDisallow: /games/*-test\nSitemap: ${baseUrl}/sitemap.xml\n`));

// HTML documents live in the project root; serve private documents only after their access checks.
app.get('/admin.html', requireAdminPage, async (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/profile.html', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect('/login.html?error=state');
  if (user.isAdmin) return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'profile.html'));
});
app.get('/profile', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect('/login.html?error=state');
  if (user.isAdmin) return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'profile.html'));
});
app.get(['/favorites.html', '/favorites'], async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect('/login.html?error=state');
  if (user.isAdmin) return res.redirect('/admin.html');
  res.sendFile(path.join(__dirname, 'favorites.html'));
});
app.get('/admin', requireAdminPage, async (req, res) => res.redirect('/admin.html'));
app.get('/admin/metrics', requireAdminPage, async (req, res) => res.sendFile(path.join(__dirname, 'admin-metrics.html')));
app.get('/admin/player', requireAdminPage, async (req, res) => res.sendFile(path.join(__dirname, 'admin-player.html')));
app.get('/admin/recommendations', requireAdminPage, async (req, res) => res.sendFile(path.join(__dirname, 'admin-recommendations.html')));
app.get(['/login.html', '/reset-password.html', '/documentation.html', '/sdk.html', '/privacy-policy.html', '/leaderboard.html', '/404.html'], async (req, res) => {
  res.sendFile(path.join(__dirname, path.basename(req.path)));
});
// The game SDK is loaded inside sandboxed game iframes with an opaque origin.
// Override the site's default same-site CORP policy so the injected script can load.
app.get('/js/game-sdk.js', (_req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(path.join(publicDir, 'js', 'game-sdk.js'));
});
app.use(express.static(publicDir, { index: false, maxAge: env.NODE_ENV === 'production' ? '1h' : 0, fallthrough: true }));
app.get(['/', '/games', '/index.html'], async (req, res) => {
  try {
    let html = await fsp.readFile(path.join(__dirname, 'index.html'), 'utf8');
    html = html.replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${escapeHtml(baseUrl)}/">`)
      .replace('<meta property="og:url" content="/">', `<meta property="og:url" content="${escapeHtml(baseUrl)}/">`);
    res.type('html').send(html);
  } catch { res.status(500).send('Could not load catalogue.'); }
});
app.get('/login', async (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.use(async (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found.' });
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Invalid upload.' });
  const safeMessage = String(error?.message || error || 'Unexpected server error.')
    .replace(/(token|password|secret|authorization|cookie)\s*[:=]\s*[^\s,;]+/ig, '$1=[redacted]')
    .slice(0, 600);
  recentPlatformErrors.unshift({ scope: 'platform', at: new Date().toISOString(), title: `${req.method} ${req.path}`, path: req.path, message: safeMessage, status: Number(error?.status || 500) });
  if (recentPlatformErrors.length > 100) recentPlatformErrors.length = 100;
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const port = Number(env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`SUPER CUBE Games Platform listening on ${baseUrl}`);
  if (!env.ADMIN_EMAIL) console.warn('ADMIN_EMAIL is empty; no account can access the administrator workspace.');
  if (!env.ADMIN_LOGIN || !env.ADMIN_PASSWORD) console.warn('ADMIN_LOGIN or ADMIN_PASSWORD is empty; environment-based administrator sign-in is disabled.');
  recordPlatformSnapshot(db).catch((error) => console.warn('[metrics] initial snapshot failed:', error.message));
  const snapshotTimer = setInterval(() => {
    recordPlatformSnapshot(db).catch((error) => console.warn('[metrics] snapshot failed:', error.message));
  }, 60_000);
  snapshotTimer.unref();
  // Published server games are started after the platform is listening, using a per-game isolated Docker container.
  setTimeout(async () => {
    const publishedServerGames = await db.prepare("SELECT * FROM games WHERE status='published' AND runtime_type='server' ORDER BY published_at").all();
    for (const game of publishedServerGames) {
      try { await ensureServerGame(game, gamesDir); }
      catch (error) { console.warn(`[server-game:${game.slug}] startup warmup failed: ${error.message}`); }
    }
  }, 500).unref();
});

server.on('upgrade', async (req, socket, head) => {
  const pathname = String(req.url || '').split('?')[0];
  const testMatch = pathname.match(/^\/server-games-test\/([a-z0-9-]+)\/?(.*)$/i);
  const publicMatch = pathname.match(/^\/server-games\/([a-z0-9-]+)\/?(.*)$/i);
  const match = testMatch || publicMatch;
  if (!match) { socket.destroy(); return; }
  const isTest = Boolean(testMatch);
  const game = await getGameBySlug(db, match[1]);
  const allowed = isTest
    ? Boolean(game && game.status === 'draft' && verifyTestPreview(req, game.slug, 'scgames_runtime_test_'))
    : Boolean(game && game.status === 'published');
  if (!allowed || (game.runtime_type || 'browser') !== 'server') { socket.destroy(); return; }
  try {
    const instance = await ensureServerGame(game, gamesDir);
    await proxyServerGameUpgrade(req, socket, head, instance, match[2] || '');
  } catch (error) { console.error(`[server-game-ws:${match[1]}]`, error.message); socket.destroy(); }
});

let shutdownPromise = null;
function shutdown() {
  if (shutdownPromise) return;
  shutdownPromise = (async () => {
    const forceExit = setTimeout(() => process.exit(1), 15000);
    forceExit.unref();
    await stopAllServerGames().catch((error) => console.error('[shutdown] could not stop every game runtime:', error.message));
    await new Promise((resolve) => server.close(resolve));
    try { db.close(); } catch {}
    try { sessionStore.close?.(); } catch {}
    clearTimeout(forceExit);
  })();
  shutdownPromise.catch((error) => { console.error('[shutdown] failed:', error.message); process.exitCode = 1; });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
