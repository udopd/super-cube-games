import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.DATA_API_PORT || 4001);
const token = String(process.env.DATA_API_TOKEN || '');
if (token.length < 32) throw new Error('DATA_API_TOKEN must be at least 32 characters.');
if (!process.env.DATABASE_URL && !(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE)) {
  throw new Error('Set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD and PGDATABASE for Data API.');
}

const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  max: Number(process.env.DATA_API_POOL_MAX || 15),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  ...(process.env.DATABASE_SSL === '1' ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== '0' } } : {})
});
const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
const migrationsDir = path.join(__dirname, 'migrations');
await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
async function applyMigration(version, sql) {
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const alreadyApplied = (await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1', [version])).rows[0];
  if (alreadyApplied) {
    if (alreadyApplied.checksum !== checksum) throw new Error(`Migration ${version} has changed after application. Add a new migration instead of editing an applied file.`);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
    await client.query('COMMIT');
    console.log(`[data-api:migration] applied ${version}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
await applyMigration('001_initial', schema);
const migrationFiles = (await fs.readdir(migrationsDir).catch(() => []))
  .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/i.test(name)).sort();
for (const name of migrationFiles) await applyMigration(name.replace(/\.sql$/i, ''), await fs.readFile(path.join(migrationsDir, name), 'utf8'));
const queryCatalog = JSON.parse(await fs.readFile(path.join(__dirname, 'query-catalog.json'), 'utf8'));

function constantTimeTokenMatch(value) {
  const actual = Buffer.from(String(value || ''));
  const expected = Buffer.from(token);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function internalAuth(req, res, next) {
  if (!constantTimeTokenMatch(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Internal service authentication required.', code: 'UNAUTHORIZED' });
  }
  next();
}
function safeParams(params) {
  if (!Array.isArray(params) || params.length > 80) throw Object.assign(new Error('Invalid query parameters.'), { status: 400, code: 'INVALID_PARAMS' });
  return params.map((value) => {
    if (value === undefined) return null;
    if (value === null || ['string','number'].includes(typeof value)) return value;
    // SQLite historically accepted booleans as integer flags; keep the same wire semantics for SMALLINT/CASE parameters in PostgreSQL.
    if (typeof value === 'boolean') return Number(value);
    if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
    throw Object.assign(new Error('Unsupported parameter type.'), { status: 400, code: 'INVALID_PARAMS' });
  });
}
function resolveQuery(queryId, mode, params) {
  if (typeof queryId !== 'string' || !/^[a-f0-9]{64}$/.test(queryId)) throw Object.assign(new Error('Invalid query identifier.'), { status: 400, code: 'INVALID_QUERY' });
  const item = queryCatalog[queryId];
  if (!item) throw Object.assign(new Error('The statement is not registered in the Data API allowlist.'), { status: 403, code: 'QUERY_NOT_ALLOWED' });
  if (!['get','all','run'].includes(mode)) throw Object.assign(new Error('Invalid query mode.'), { status: 400, code: 'INVALID_MODE' });
  const cleanParams = safeParams(params);
  if (cleanParams.length !== item.parameterCount) throw Object.assign(new Error('Incorrect number of parameters for this registered statement.'), { status: 400, code: 'PARAMETER_COUNT_MISMATCH' });
  const statementType = item.sql.trim().split(/\s+/, 1)[0].toUpperCase();
  const read = statementType === 'SELECT' || statementType === 'WITH';
  if (read && mode === 'run') throw Object.assign(new Error('Read statements must use get/all mode.'), { status: 400, code: 'INVALID_MODE' });
  if (!read && mode !== 'run') throw Object.assign(new Error('Write statements must use run mode.'), { status: 400, code: 'INVALID_MODE' });
  let sql = item.sql;
  let returnsId = false;
  if (mode === 'run' && item.returnsId && /^INSERT\s+INTO\s+/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
    sql += ' RETURNING id';
    returnsId = true;
  }
  return { sql, params: cleanParams, returnsId, item };
}
function shapeRows(rows, fields, sourceSql) {
  const aliases = [...String(sourceSql).matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]).filter((alias) => alias !== alias.toLowerCase());
  const numericOids = new Set([20, 21, 23, 700, 701, 1700]);
  return rows.map((original) => {
    const row = { ...original };
    for (const alias of aliases) {
      const lower = alias.toLowerCase();
      if (Object.hasOwn(row, lower) && lower !== alias) { row[alias] = row[lower]; delete row[lower]; }
    }
    for (const field of fields || []) {
      const targetName = aliases.find((alias) => alias.toLowerCase() === field.name.toLowerCase()) || field.name;
      if (numericOids.has(field.dataTypeID) && typeof row[targetName] === 'string' && /^-?\d+(?:\.\d+)?$/.test(row[targetName])) {
        const num = Number(row[targetName]);
        if (Number.isFinite(num) && Number.isSafeInteger(num) || Number.isFinite(num) && field.dataTypeID === 1700) row[targetName] = num;
      }
    }
    return row;
  });
}
async function executeQuery(client, statement) {
  const { sql, params, returnsId, item } = resolveQuery(statement.queryId, statement.mode, statement.params);
  const result = await client.query(sql, params);
  const rows = shapeRows(result.rows || [], result.fields, item.sourceSql);
  const insertId = returnsId && rows.length ? rows[0].id : undefined;
  return { rows, rowCount: result.rowCount || 0, ...(insertId !== undefined ? { insertId: Number(insertId) } : {}) };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb', strict: true }));
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'postgresql' }); }
  catch { res.status(503).json({ status: 'error' }); }
});
app.use('/internal/v1', internalAuth);
app.post('/internal/v1/query', async (req, res) => {
  try {
    const statement = { queryId: req.body?.queryId, mode: req.body?.mode, params: req.body?.params };
    const result = await executeQuery(pool, statement);
    res.json(result);
  } catch (error) {
    const status = error.status || (String(error.code || '').startsWith('23') ? 409 : String(error.code || '').startsWith('22') ? 400 : 500);
    if (status >= 500) console.error('[data-api:query]', error.code || 'DB_ERROR', error.message);
    res.status(status).json({ error: status >= 500 ? 'Data operation failed.' : error.message, code: status >= 500 ? 'DATA_OPERATION_FAILED' : error.code || 'QUERY_FAILED' });
  }
});
app.post('/internal/v1/batch', async (req, res) => {
  const statements = req.body?.statements;
  if (!Array.isArray(statements) || statements.length > 100) return res.status(400).json({ error: 'Batch must contain 1–100 statements.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const statement of statements) results.push(await executeQuery(client, statement));
    await client.query('COMMIT');
    res.json({ results });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const status = error.status || (String(error.code || '').startsWith('23') ? 409 : String(error.code || '').startsWith('22') ? 400 : 500);
    if (status >= 500) console.error('[data-api:batch]', error.code || 'DB_ERROR', error.message);
    res.status(status).json({ error: status >= 500 ? 'Data transaction failed.' : error.message, code: status >= 500 ? 'DATA_TRANSACTION_FAILED' : error.code || 'BATCH_FAILED' });
  } finally { client.release(); }
});

// Express session store operations. The session payload is server-controlled and cannot be accessed by game iframes.
app.post('/internal/v1/sessions/get', async (req, res) => {
  const sid = String(req.body?.sid || '').slice(0, 256);
  try {
    const result = await pool.query('SELECT sess FROM app_sessions WHERE sid=$1 AND expire > NOW()', [sid]);
    res.json({ session: result.rows[0]?.sess || null });
  } catch (error) { console.error('[data-api:session-get]', error.message); res.status(500).json({ error: 'Session lookup failed.' }); }
});
app.post('/internal/v1/sessions/set', async (req, res) => {
  const sid = String(req.body?.sid || '').slice(0, 256);
  const sess = req.body?.session;
  const maxAge = Math.max(1000, Math.min(1000 * 60 * 60 * 24 * 31, Number(req.body?.maxAge || 1000 * 60 * 60 * 24 * 14)));
  if (!sid || !sess || typeof sess !== 'object') return res.status(400).json({ error: 'Invalid session.' });
  try {
    await pool.query(`INSERT INTO app_sessions(sid,sess,expire) VALUES($1,$2::jsonb,NOW()+($3 * INTERVAL '1 millisecond'))
      ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expire=excluded.expire`, [sid, JSON.stringify(sess), maxAge]);
    res.json({ ok: true });
  } catch (error) { console.error('[data-api:session-set]', error.message); res.status(500).json({ error: 'Session write failed.' }); }
});
app.post('/internal/v1/sessions/destroy', async (req, res) => {
  try { await pool.query('DELETE FROM app_sessions WHERE sid=$1', [String(req.body?.sid || '').slice(0, 256)]); res.json({ ok: true }); }
  catch (error) { console.error('[data-api:session-destroy]', error.message); res.status(500).json({ error: 'Session delete failed.' }); }
});
app.post('/internal/v1/sessions/touch', async (req, res) => {
  const maxAge = Math.max(1000, Math.min(1000 * 60 * 60 * 24 * 31, Number(req.body?.maxAge || 1000 * 60 * 60 * 24 * 14)));
  try { await pool.query(`UPDATE app_sessions SET expire=NOW()+($2 * INTERVAL '1 millisecond') WHERE sid=$1`, [String(req.body?.sid || '').slice(0, 256), maxAge]); res.json({ ok: true }); }
  catch (error) { console.error('[data-api:session-touch]', error.message); res.status(500).json({ error: 'Session touch failed.' }); }
});
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

const server = app.listen(port, '0.0.0.0', () => console.log(`[data-api] listening on 0.0.0.0:${port}; PostgreSQL connected.`));
const sessionCleanupTimer = setInterval(() => {
  pool.query('DELETE FROM app_sessions WHERE expire <= NOW()').catch((error) => console.warn('[data-api:session-cleanup]', error.message));
}, 6 * 60 * 60 * 1000);
sessionCleanupTimer.unref();
const cleanup = async () => {
  clearInterval(sessionCleanupTimer);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
};
process.on('SIGTERM', () => cleanup().finally(() => process.exit(0)));
process.on('SIGINT', () => cleanup().finally(() => process.exit(0)));
