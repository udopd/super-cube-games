import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const normalize = (sql) => String(sql).trim().replace(/\s+/g, ' ');
const file = new URL('../data-service/query-catalog.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
assert.ok(Object.keys(catalog).length >= 50, 'catalog should include the platform SQL statements');
for (const [id, item] of Object.entries(catalog)) {
  assert.match(id, /^[a-f0-9]{64}$/, 'each query key should be a SHA-256 digest');
  assert.equal(crypto.createHash('sha256').update(normalize(item.sourceSql)).digest('hex'), id, 'query ID must match normalized source');
  assert.equal(normalize(item.sql).includes('?'), false, 'PostgreSQL statements must not contain SQLite placeholders');
  assert.ok(/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(item.sql.trim()), 'only registered data operations are allowed');
  assert.ok(Number.isInteger(item.parameterCount) && item.parameterCount >= 0 && item.parameterCount <= 80);
  const parameters = [...item.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const max = Math.max(0, ...parameters);
  assert.equal(max, item.parameterCount, `parameter count mismatch for ${id}`);
  for (let n = 1; n <= max; n += 1) assert.ok(parameters.includes(n), `missing $${n} in ${id}`);
  if (item.returnsId) assert.match(item.sql.trim(), /^INSERT\s+INTO\s+(users|identities|games|game_events|reviews)\b/i);
  if (/^INSERT\s+INTO\s+identities\b/i.test(item.sql) && /ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i.test(item.sql)) assert.equal(item.returnsId, false, 'idempotent identity inserts must not append RETURNING id');
}
console.log(`PASS query catalog: ${Object.keys(catalog).length} registered statements, stable ids and parameter counts`);
