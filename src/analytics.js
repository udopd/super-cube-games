import crypto from 'node:crypto';

const now = () => new Date().toISOString();
const ALLOWED_EVENTS = new Set([
  'catalog_click', 'game_open', 'game_click', 'custom_click', 'level_start', 'level_complete',
  'favorite_added', 'favorite_removed', 'rating_submitted', 'review_submitted', 'game_shared'
]);

export async function recordGameEvent(db, { gameId, userId = null, guestId = '', type, source = 'direct', metadata = {} }) {
  if (!ALLOWED_EVENTS.has(type)) return;
  const cleanSource = ['catalog', 'external', 'direct', 'internal'].includes(source) ? source : 'direct';
  await db.prepare(`INSERT INTO game_events(game_id,user_id,guest_id,event_type,source,metadata_json,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(gameId, userId, String(guestId || '').slice(0, 100), type, cleanSource, JSON.stringify(metadata || {}).slice(0, 1000), now());
}

export function classifySource(req, explicitSource = '') {
  if (['catalog', 'external', 'direct', 'internal'].includes(explicitSource)) return explicitSource;
  const referer = req.get('referer');
  if (!referer) return 'direct';
  try { return new URL(referer).origin !== `${req.protocol}://${req.get('host')}` ? 'external' : 'internal'; }
  catch { return 'direct'; }
}

export async function createPlaySession(db, { gameId, userId, guestId, source }) {
  const id = crypto.randomUUID();
  const timestamp = now();
  await db.prepare(`INSERT INTO play_sessions(id,game_id,user_id,guest_id,started_at,last_seen_at,source,is_active)
    VALUES(?,?,?,?,?,?,?,1)`).run(id, gameId, userId || null, String(guestId || crypto.randomUUID()).slice(0, 100), timestamp, timestamp, source || 'direct');
  return { id, startedAt: timestamp };
}

// Count only short, foreground heartbeat intervals. Clients cannot claim arbitrary durations.
export async function touchPlaySession(db, { id, userId, guestId, end = false, active = true }) {
  const row = await db.prepare('SELECT * FROM play_sessions WHERE id=?').get(id);
  if (!row) return null;
  if (row.ended_at) return { durationSeconds: Number(row.duration_seconds || 0), addedSeconds: 0, endedAt: row.ended_at };
  if (row.user_id && Number(row.user_id) !== Number(userId)) return null;
  if (!row.user_id && row.guest_id !== String(guestId || '')) return null;
  const currentMs = Date.now();
  const previousMs = new Date(row.last_seen_at).getTime();
  const gapSeconds = Number.isFinite(previousMs) ? Math.floor((currentMs - previousMs) / 1000) : 0;
  const addSeconds = row.is_active && active && gapSeconds > 0 && gapSeconds <= 35 ? Math.min(30, gapSeconds) : 0;
  const duration = Math.min(60 * 60 * 24, Math.max(0, Number(row.duration_seconds || 0) + addSeconds));
  const timestamp = now();
  await db.prepare(`UPDATE play_sessions SET last_seen_at=?, duration_seconds=?, is_active=?, ended_at=CASE WHEN ? THEN COALESCE(ended_at,?) ELSE ended_at END WHERE id=?`)
    .run(timestamp, duration, end ? 0 : (active ? 1 : 0), end ? 1 : 0, end ? timestamp : null, id);
  return { durationSeconds: duration, addedSeconds: addSeconds, endedAt: end ? timestamp : null };
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0).map(Number).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : Math.round((nums[middle - 1] + nums[middle]) / 2);
}

const GAME_METRICS_SQL = `SELECT
  (SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id ELSE 'g:'||guest_id END) FROM play_sessions WHERE game_id=?) AS unique_players,
  (SELECT COUNT(*) FROM play_sessions WHERE game_id=?) AS sessions,
  (SELECT COALESCE(SUM(duration_seconds),0) FROM play_sessions WHERE game_id=?) AS total_play_seconds,
  (SELECT ROUND(AVG(rating)::numeric,2) FROM ratings WHERE game_id=?) AS average_rating,
  (SELECT COUNT(*) FROM ratings WHERE game_id=?) AS ratings_count,
  (SELECT COUNT(*) FROM reviews WHERE game_id=? AND parent_id IS NULL) AS reviews_count,
  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) FROM play_sessions WHERE game_id=? AND duration_seconds>0) AS median_seconds,
  (SELECT COUNT(*) FROM game_events WHERE game_id=? AND event_type IN ('game_click','custom_click')) AS clicks,
  (SELECT COUNT(*) FROM game_events WHERE game_id=? AND event_type='catalog_click') AS catalog_clicks,
  (SELECT COUNT(*) FROM game_events WHERE game_id=? AND event_type='game_open' AND source='external') AS external_referrals,
  (SELECT COUNT(*) FROM favorites WHERE game_id=?) AS favorites,
  (SELECT COUNT(*) FROM game_events WHERE game_id=? AND event_type='game_shared') AS share_events,
  (SELECT COUNT(DISTINCT COALESCE('u:'||user_id,'g:'||guest_id)) FROM game_events WHERE game_id=? AND event_type='game_shared') AS shared_players`;

function normalizeGameMetrics(row = {}) {
  const totalPlaySeconds = Number(row.total_play_seconds || 0);
  return {
    uniquePlayers: Number(row.unique_players || 0), sessions: Number(row.sessions || 0), totalPlaySeconds,
    totalPlayMinutes: Math.round(totalPlaySeconds / 60),
    medianPlayMinutes: Math.round(Number(row.median_seconds || 0) / 60 * 10) / 10,
    averageRating: Number(row.average_rating || 0), ratingsCount: Number(row.ratings_count || 0), reviewsCount: Number(row.reviews_count || 0),
    clicks: Number(row.clicks || 0), catalogClicks: Number(row.catalog_clicks || 0), externalReferrals: Number(row.external_referrals || 0),
    favorites: Number(row.favorites || 0), shareEvents: Number(row.share_events || 0), sharedPlayers: Number(row.shared_players || 0)
  };
}

export async function getGameMetrics(db, gameId) {
  const row = await db.prepare(GAME_METRICS_SQL).get(...Array(13).fill(gameId));
  return normalizeGameMetrics(row);
}

async function getGameMetricsBatch(db, games) {
  const rows = new Map();
  for (let start = 0; start < games.length; start += 7) {
    const chunk = games.slice(start, start + 7);
    const results = await db.batch(chunk.map((game) => ({ sql: GAME_METRICS_SQL, params: Array(13).fill(game.id), mode: 'get' })));
    results.forEach((result, index) => rows.set(Number(chunk[index].id), normalizeGameMetrics(result.rows?.[0])));
  }
  return rows;
}

export async function getCatalogGames(db, query = {}) {
  const games = await db.prepare("SELECT * FROM games WHERE status='published' ORDER BY published_at DESC").all();
  const metricsById = await getGameMetricsBatch(db, games);
  let rows = games.map((game) => ({ game, metrics: metricsById.get(Number(game.id)) }));
  const lang = String(query.lang || 'ru') === 'en' ? 'en' : 'ru';
  const tag = String(query.tag || '').trim().toLowerCase();
  const q = String(query.q || '').trim().toLowerCase();
  const minRating = Number(query.minRating || 0);
  const playerType = String(query.players || 'any');
  if (tag) rows = rows.filter(({ game }) => JSON.parse(game.tags_en_json || game.tags_json || '[]').some((value) => value.toLowerCase() === tag));
  if (q) rows = rows.filter(({ game }) => `${game.title} ${lang === 'en' ? game.description_en : game.description_ru} ${JSON.parse(game.tags_en_json || game.tags_json || '[]').join(' ')}`.toLowerCase().includes(q));
  if (Number.isFinite(minRating) && minRating > 0) rows = rows.filter(({ metrics }) => metrics.averageRating >= minRating);
  if (playerType === 'solo') rows = rows.filter(({ game }) => game.min_players <= 1 && game.max_players <= 1);
  if (['multi', '2plus'].includes(playerType)) rows = rows.filter(({ game }) => game.max_players >= 2);
  const sort = String(query.sort || 'newest');
  rows.sort((a, b) => {
    if (sort === 'rating') return b.metrics.averageRating - a.metrics.averageRating || b.metrics.uniquePlayers - a.metrics.uniquePlayers;
    if (sort === 'players') return b.metrics.uniquePlayers - a.metrics.uniquePlayers;
    if (sort === 'plays') return b.metrics.sessions - a.metrics.sessions;
    return String(b.game.published_at || b.game.created_at).localeCompare(String(a.game.published_at || a.game.created_at));
  });
  return rows.map(({ game, metrics }) => {
    const tags = JSON.parse(game.tags_en_json || game.tags_json || '[]').map((tag) => String(tag).toLowerCase());
    return {
      id: game.id, slug: game.slug, title: game.title,
      description: (lang === 'en' ? game.description_en : game.description_ru) || game.description,
      descriptionRu: game.description_ru || game.description, descriptionEn: game.description_en || game.description,
      tags, capsule: `/game-files/${encodeURIComponent(game.slug)}/${game.capsule_path.split('/').map(encodeURIComponent).join('/')}`,
      minPlayers: game.min_players, maxPlayers: game.max_players, runtimeType: game.runtime_type || 'browser',
      averageRating: metrics.averageRating, ratingsCount: metrics.ratingsCount, uniquePlayers: metrics.uniquePlayers,
      sessions: metrics.sessions, favorites: metrics.favorites, publishedAt: game.published_at
    };
  });
}

export async function getAdminGames(db) {
  const games = await db.prepare('SELECT * FROM games ORDER BY created_at DESC').all();
  const metricsById = await getGameMetricsBatch(db, games);
  return games.map((game) => ({
    id: game.id, slug: game.slug, title: game.title, description: game.description,
    descriptionRu: game.description_ru || game.description, descriptionEn: game.description_en || game.description,
    tags: JSON.parse(game.tags_json || '[]').map((tag) => String(tag).toLowerCase()), tagsRu: JSON.parse(game.tags_ru_json || game.tags_json || '[]').map((tag) => String(tag).toLowerCase()), tagsEn: JSON.parse(game.tags_en_json || game.tags_json || '[]').map((tag) => String(tag).toLowerCase()),
    capsule: `/game-files/${encodeURIComponent(game.slug)}/${game.capsule_path.split('/').map(encodeURIComponent).join('/')}`,
    minPlayers: game.min_players, maxPlayers: game.max_players, status: game.status, runtimeType: game.runtime_type || 'browser',
    archiveBytes: Number(game.archive_bytes || 0), createdAt: game.created_at, publishedAt: game.published_at,
    testUrl: `/games/${encodeURIComponent(game.slug)}-test`, publicUrl: `/games/${encodeURIComponent(game.slug)}`,
    metrics: metricsById.get(Number(game.id))
  }));
}

export async function getPlayerSummary(db, userId) {
  const allRows = await db.prepare(`SELECT g.id,g.slug,g.title,g.description,g.description_ru,g.description_en,g.tags_json,g.tags_ru_json,g.tags_en_json,g.capsule_path,g.min_players,g.max_players,
      MAX(p.started_at) AS lastPlayed, SUM(p.duration_seconds) AS playSeconds, COUNT(p.id) AS sessions
    FROM play_sessions p JOIN games g ON g.id=p.game_id WHERE p.user_id=? AND g.status='published'
    GROUP BY g.id ORDER BY lastPlayed DESC`).all(userId);
  const allPlayed = allRows.map(decoratePlayerGame);
  const byTime = [...allPlayed].sort((a, b) => b.playSeconds - a.playSeconds).slice(0, 3);
  const recent = allPlayed.slice(0, 5);
  const favoriteRows = await db.prepare(`SELECT g.id,g.slug,g.title,g.description,g.description_ru,g.description_en,g.tags_json,g.tags_ru_json,g.tags_en_json,g.capsule_path,g.min_players,g.max_players, f.created_at AS lastPlayed
    FROM favorites f JOIN games g ON g.id=f.game_id WHERE f.user_id=? AND g.status='published' ORDER BY f.created_at DESC`).all(userId);
  const favorites = favoriteRows.map(decoratePlayerGame);
  return { played: allPlayed, favorites, recent, topPlayed: byTime };
}
function decoratePlayerGame(game) {
  return { id: game.id, slug: game.slug, title: game.title, description: game.description,
    descriptionRu: game.description_ru || game.description, descriptionEn: game.description_en || game.description,
    tags: JSON.parse(game.tags_json || '[]').map((tag) => String(tag).toLowerCase()), capsule: `/game-files/${encodeURIComponent(game.slug)}/${game.capsule_path.split('/').map(encodeURIComponent).join('/')}`,
    minPlayers: game.min_players, maxPlayers: game.max_players, lastPlayed: game.lastPlayed,
    playSeconds: Number(game.playSeconds || 0), playMinutes: Math.round(Number(game.playSeconds || 0) / 60), sessions: Number(game.sessions || 0) };
}

function reviewPoints(length) {
  return length >= 100 ? 25 : Math.max(10, Math.min(24, 10 + Math.floor(Math.max(0, length - 3) / 7)));
}
async function playerScores(db) {
  const users = await db.prepare('SELECT id,public_id,display_name,email,avatar_url,created_at FROM users WHERE email_verified=1').all();
  const scoreRows = await Promise.all(users.map(async (user) => {
    const [time, reviews, favorites, shares] = await Promise.all([
      db.prepare('SELECT COALESCE(SUM(duration_seconds),0) AS seconds,COUNT(DISTINCT game_id) AS games,COUNT(*) AS sessions FROM play_sessions WHERE user_id=?').get(user.id),
      db.prepare('SELECT game_id,MAX(LENGTH(body)) AS longest FROM reviews WHERE user_id=? AND is_admin_reply=0 AND parent_id IS NULL GROUP BY game_id').all(user.id),
      db.prepare("SELECT COUNT(DISTINCT game_id) AS n FROM game_events WHERE user_id=? AND event_type='favorite_added'").get(user.id),
      db.prepare("SELECT COUNT(DISTINCT game_id) AS n FROM game_events WHERE user_id=? AND event_type='game_shared'").get(user.id)
    ]);
    const reviewScore = reviews.reduce((sum, review) => sum + reviewPoints(Number(review.longest || 0)), 0);
    const seconds = Number(time?.seconds || 0);
    const favoriteCount = Number(favorites?.n || 0);
    const shareCount = Number(shares?.n || 0);
    const points = Math.floor(seconds / 60) + reviewScore + favoriteCount * 5 + shareCount * 5 + Math.floor(seconds / 3600) * 15;
    return { user, points, totalSeconds: seconds, gamesPlayed: Number(time?.games || 0), sessions: Number(time?.sessions || 0), reviewCount: reviews.length, reviewPoints: reviewScore, favoritePoints: favoriteCount * 5, sharePoints: shareCount * 5, hourBonus: Math.floor(seconds / 3600) * 15 };
  }));
  return scoreRows.sort((a, b) => b.points - a.points || b.totalSeconds - a.totalSeconds || a.user.id - b.user.id);
}
export async function getPublicLeaderboard(db, limit = 100) {
  return (await playerScores(db)).slice(0, Math.max(1, Math.min(100, Number(limit) || 100))).map((item, index) => ({
    rank: index + 1, playerId: item.user.public_id || `SC-${String(item.user.id).padStart(6, '0')}`,
    nickname: item.user.display_name || `Player ${String(item.user.public_id || item.user.id).slice(-4)}`, points: item.points
  }));
}
export async function getAdminLeaderboard(db, limit = 100) {
  return (await playerScores(db)).slice(0, Math.max(1, Math.min(100000, Number(limit) || 100))).map((item, index) => ({
    rank: index + 1, id: item.user.id, playerId: item.user.public_id, nickname: item.user.display_name || '', email: item.user.email,
    avatar: item.user.avatar_url || '', points: item.points, totalSeconds: item.totalSeconds, gamesPlayed: item.gamesPlayed,
    sessions: item.sessions, reviewCount: item.reviewCount, reviewPoints: item.reviewPoints,
    favoritePoints: item.favoritePoints, sharePoints: item.sharePoints, hourBonus: item.hourBonus, createdAt: item.user.created_at
  }));
}
function distinctPlayerKey(row) {
  return row.user_id !== null && row.user_id !== undefined ? `u:${row.user_id}` : `g:${row.guest_id}`;
}

export async function recordPlatformSnapshot(db, at = new Date()) {
  const bucket = new Date(Math.floor(at.getTime() / 60000) * 60000).toISOString();
  const cutoff = new Date(at.getTime() - 45_000).toISOString();
  const today = at.toISOString().slice(0, 10);
  const [active, dailyRow, totals, games] = await Promise.all([
    db.prepare(`SELECT game_id,user_id,guest_id FROM play_sessions WHERE ended_at IS NULL AND is_active=1 AND last_seen_at>=?`).all(cutoff),
    db.prepare(`SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id ELSE 'g:'||guest_id END) AS n FROM play_sessions WHERE substr(started_at,1,10)=?`).get(today),
    db.prepare('SELECT COUNT(*) AS sessions,COALESCE(SUM(duration_seconds),0) AS seconds FROM play_sessions').get(),
    db.prepare("SELECT id FROM games WHERE status='published'").all()
  ]);
  const platformPlayers = new Set(active.map(distinctPlayerKey));
  const perGame = new Map();
  for (const row of active) {
    if (!perGame.has(row.game_id)) perGame.set(row.game_id, new Set());
    perGame.get(row.game_id).add(distinctPlayerKey(row));
  }
  const dailyPlayers = Number(dailyRow?.n || 0);
  const insertSql = `INSERT INTO metric_snapshots(period,bucket_at,scope_key,game_id,ccu,daily_players,sessions,total_seconds)
    VALUES('minute',?,?,?,?,?,?,?) ON CONFLICT(period,bucket_at,scope_key) DO UPDATE SET
    game_id=excluded.game_id,ccu=excluded.ccu,daily_players=excluded.daily_players,sessions=excluded.sessions,total_seconds=excluded.total_seconds`;
  const statements = [{ sql: insertSql, params: [bucket, 'platform', null, platformPlayers.size, dailyPlayers, Number(totals?.sessions || 0), Number(totals?.seconds || 0)], mode: 'run' },
    ...games.map((game) => ({ sql: insertSql, params: [bucket, `game:${game.id}`, game.id, perGame.get(game.id)?.size || 0, 0, 0, 0], mode: 'run' }))];
  await db.batch(statements);
  return { bucketAt: bucket, ccu: platformPlayers.size, dailyPlayers };
}

async function getTrendHistory(db) {
  const nowDate = new Date();
  const cutoff = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [ccu24h, gameRows, dailyRows, latest, current, dailyGameRows, publishedGames] = await Promise.all([
    db.prepare(`SELECT bucket_at AS at,ccu FROM metric_snapshots WHERE period='minute' AND scope_key='platform' AND bucket_at>=? ORDER BY bucket_at`).all(cutoff),
    db.prepare(`SELECT s.bucket_at AS at,s.game_id,s.ccu,g.slug,g.title FROM metric_snapshots s JOIN games g ON g.id=s.game_id WHERE s.period='minute' AND s.scope_key LIKE 'game:%' AND s.bucket_at>=? ORDER BY s.bucket_at`).all(cutoff),
    db.prepare(`SELECT substr(started_at,1,10) AS day, COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id ELSE 'g:'||guest_id END) AS players FROM play_sessions WHERE substr(started_at,1,10)>=? GROUP BY substr(started_at,1,10) ORDER BY day`).all(new Date(nowDate.getTime() - 29 * 86400000).toISOString().slice(0, 10)),
    db.prepare(`SELECT ccu FROM metric_snapshots WHERE period='minute' AND scope_key='platform' ORDER BY bucket_at DESC LIMIT 1`).get(),
    db.prepare(`SELECT game_id,user_id,guest_id FROM play_sessions WHERE ended_at IS NULL AND is_active=1 AND last_seen_at>=?`).all(new Date(nowDate.getTime() - 45000).toISOString()),
    db.prepare(`SELECT ps.game_id,g.slug,g.title,COUNT(DISTINCT CASE WHEN ps.user_id IS NOT NULL THEN 'u:'||ps.user_id ELSE 'g:'||ps.guest_id END) AS players FROM play_sessions ps JOIN games g ON g.id=ps.game_id WHERE substr(ps.started_at,1,10)=? GROUP BY ps.game_id,g.slug,g.title`).all(nowDate.toISOString().slice(0,10)),
    db.prepare("SELECT id,slug,title FROM games WHERE status='published'").all()
  ]);
  const games = {};
  for (const row of gameRows) {
    if (!games[row.slug]) games[row.slug] = { title: row.title, points: [] };
    games[row.slug].points.push({ at: row.at, ccu: Number(row.ccu || 0) });
  }
  const playerByDay = new Map(dailyRows.map((row) => [row.day, Number(row.players || 0)]));
  const dailyPlayers30d = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowDate.getTime() - i * 86400000).toISOString().slice(0, 10);
    dailyPlayers30d.push({ day: d, players: playerByDay.get(d) || 0 });
  }
  const currentPlayers = new Set(current.map(distinctPlayerKey));
  const currentGameSets = new Map();
  for (const row of current) {
    if (!currentGameSets.has(row.game_id)) currentGameSets.set(row.game_id, new Set());
    currentGameSets.get(row.game_id).add(distinctPlayerKey(row));
  }
  const gameCcuNow = publishedGames.map((game) => ({ slug: game.slug, title: game.title, ccu: currentGameSets.get(game.id)?.size || 0 }));
  const todayByGame = new Map(dailyGameRows.map((row) => [Number(row.game_id), Number(row.players || 0)]));
  const gamePlayersToday = publishedGames.map((game) => ({ slug: game.slug, title: game.title, players: todayByGame.get(Number(game.id)) || 0 }));
  return { currentCcu: currentPlayers.size, latestCcuSnapshot: Number(latest?.ccu || 0), ccu24h, dailyPlayers30d, dailyPlayers7d: dailyPlayers30d.slice(-7), games24h: games, gameCcuNow, gamePlayersToday };
}

export async function getPlatformMetrics(db) {
  const [games, users, sessions, ratings, reviews, platformUniquePlayers, publishedGames, draftGames] = await Promise.all([
    db.prepare('SELECT id FROM games').all(),
    db.prepare('SELECT COUNT(*) AS n FROM users').get(),
    db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(duration_seconds),0) AS seconds FROM play_sessions').get(),
    db.prepare('SELECT COUNT(*) AS n,ROUND(AVG(rating),2) AS avg FROM ratings').get(),
    db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE parent_id IS NULL').get(),
    db.prepare(`SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id ELSE 'g:'||guest_id END) AS n FROM play_sessions`).get(),
    db.prepare("SELECT COUNT(*) AS n FROM games WHERE status='published'").get(),
    db.prepare("SELECT COUNT(*) AS n FROM games WHERE status='draft'").get()
  ]);
  const metricsById = await getGameMetricsBatch(db, games);
  const metrics = games.map((item) => metricsById.get(Number(item.id)));
  const sums = ['uniquePlayers', 'sessions', 'clicks', 'catalogClicks', 'externalReferrals', 'favorites', 'shareEvents', 'sharedPlayers', 'totalPlaySeconds']
    .reduce((out, key) => ({ ...out, [key]: metrics.reduce((sum, item) => sum + Number(item[key] || 0), 0) }), {});
  const [history, leaderboard, gamesMetrics, gameplayEvents] = await Promise.all([getTrendHistory(db), getAdminLeaderboard(db, 10), getAdminGames(db),
    db.prepare("SELECT event_type,COUNT(*) AS n FROM game_events WHERE event_type IN ('level_start','level_complete') GROUP BY event_type").all()]);
  const gameplay = Object.fromEntries(gameplayEvents.map((row) => [row.event_type, Number(row.n || 0)]));
  return { games: games.length, publishedGames: Number(publishedGames?.n || 0), draftGames: Number(draftGames?.n || 0), users: Number(users?.n || 0), sessions: Number(sessions?.n || 0),
    totalPlaySeconds: Number(sessions?.seconds || 0), averageRating: Number(ratings?.avg || 0), ratings: Number(ratings?.n || 0), reviews: Number(reviews?.n || 0), ...sums,
    uniquePlayers: Number(platformUniquePlayers?.n || 0), levelStarts: gameplay.level_start || 0, levelCompletions: gameplay.level_complete || 0, levelCompletionRate: gameplay.level_start ? Math.round((gameplay.level_complete || 0) / gameplay.level_start * 1000) / 10 : 0, history, leaderboard, gamesMetrics };
}
