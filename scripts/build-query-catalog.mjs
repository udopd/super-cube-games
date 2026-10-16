import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['server.js','src/auth.js','src/games.js','src/analytics.js'];
const autoIdTables = new Set(['users','identities','games','game_events','reviews']);
const normalize = (sql) => String(sql).trim().replace(/\s+/g, ' ');
const catalog = {};
function addSql(sql) {
  const normalized = normalize(sql);
  if (!/^(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(normalized)) return;
  const id = crypto.createHash('sha256').update(normalized).digest('hex');
  const placeholders = (sql.match(/\?/g) || []).length;
  let index = 0;
  let pgSql = sql.replace(/\?/g, () => `$${++index}`).trim();
  // SQLite treats integer 0/1 as booleans in CASE; PostgreSQL requires a boolean expression.
  pgSql = pgSql.replace(/\bCASE\s+WHEN\s+(\$\d+)\s+THEN/gi, 'CASE WHEN $1 <> 0 THEN');
  const insertTable = /^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)/i.exec(normalized)?.[1]?.toLowerCase();
  const insertsId = Boolean(insertTable && autoIdTables.has(insertTable) && !/\bON\s+CONFLICT\b[\s\S]*\bDO\s+NOTHING\b/i.test(normalized));
  const item = { sourceSql: sql, sql: pgSql, parameterCount: placeholders, returnsId: insertsId };
  if (catalog[id] && normalize(catalog[id].sourceSql) !== normalized) throw new Error(`Hash collision for query ${id}`);
  catalog[id] = item;
}
function readLiteral(source, start, quote, where) {
  let end = start + 1;
  for (; end < source.length; end++) {
    if (source[end] === quote) {
      let slashes = 0;
      for (let k = end - 1; k > start && source[k] === '\\'; k--) slashes++;
      if (slashes % 2 === 0) break;
    }
  }
  if (end >= source.length) throw new Error(`Unclosed SQL literal at ${where}`);
  const literal = source.slice(start, end + 1);
  if (quote === '`' && literal.includes('${')) throw new Error(`Interpolated SQL must be reviewed manually at ${where}`);
  try { return { sql: vm.runInNewContext(literal), end }; }
  catch (error) { throw new Error(`Cannot parse SQL literal at ${where}: ${error.message}`); }
}
for (const relative of sources) {
  const file = path.join(root, relative);
  const source = await fs.readFile(file, 'utf8');
  const prepared = /db\.prepare\s*\(/g;
  let match;
  while ((match = prepared.exec(source))) {
    let start = prepared.lastIndex;
    while (/\s/.test(source[start] || '')) start++;
    const quote = source[start];
    if (!['\'', '"', '`'].includes(quote)) continue;
    const parsed = readLiteral(source, start, quote, `${relative}:${source.slice(0, start).split('\n').length}`);
    addSql(parsed.sql);
    prepared.lastIndex = parsed.end + 1;
  }
  // Reusable SQL template constants are also part of the allowlist (e.g. batched metric queries).
  const sqlConstants = /\bconst\s+[A-Za-z0-9_]*sql\s*=\s*/gi;
  while ((match = sqlConstants.exec(source))) {
    let start = sqlConstants.lastIndex;
    while (/\s/.test(source[start] || '')) start++;
    const quote = source[start];
    if (!['\'', '"', '`'].includes(quote)) continue;
    const parsed = readLiteral(source, start, quote, `${relative}:${source.slice(0, start).split('\n').length}`);
    addSql(parsed.sql);
    sqlConstants.lastIndex = parsed.end + 1;
  }
}
await fs.mkdir(path.join(root, 'data-service'), { recursive: true });
await fs.writeFile(path.join(root, 'data-service/query-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Generated ${Object.keys(catalog).length} allowlisted SQL statements.`);
