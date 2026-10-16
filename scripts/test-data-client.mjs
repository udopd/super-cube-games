import assert from 'node:assert/strict';
import http from 'node:http';
import { DataApiClient, queryIdFor } from '../shared/data-client.js';

const token = 'unit-test-token-'.padEnd(40, 'x');
const requests = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const body = raw ? JSON.parse(raw) : {};
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  requests.push({ url: req.url, authorization: req.headers.authorization, body });
  res.writeHead(200, { 'content-type': 'application/json' });
  if (req.url === '/internal/v1/batch') {
    return res.end(JSON.stringify({ results: body.statements.map((statement) => ({ rows: statement.mode === 'get' ? [{ id: 7 }] : [], rowCount: 1 })) }));
  }
  if (body.mode === 'get') return res.end(JSON.stringify({ rows: [{ id: body.params[0], title: 'test' }], rowCount: 1 }));
  if (body.mode === 'all') return res.end(JSON.stringify({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }));
  return res.end(JSON.stringify({ rows: [{ id: 91 }], rowCount: 1, insertId: 91 }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const client = new DataApiClient({ baseUrl: `http://127.0.0.1:${address.port}`, token });
try {
  assert.equal(await client.health(), true, 'health checks should work without internal auth');
  const selectSql = 'SELECT id,title FROM games WHERE id=?';
  assert.deepEqual(await client.prepare(selectSql).get(17), { id: 17, title: 'test' });
  assert.equal(requests[0].authorization, `Bearer ${token}`);
  assert.equal(requests[0].body.queryId, queryIdFor(selectSql));
  assert.deepEqual(requests[0].body.params, [17]);
  assert.equal((await client.prepare('SELECT id FROM games').all()).length, 2);
  const insertSql = 'INSERT INTO games(slug,title) VALUES(?,?)';
  const runResult = await client.prepare(insertSql).run('slug', 'Title');
  assert.equal(runResult.lastInsertRowid, 91);
  assert.equal(runResult.changes, 1);
  const batch = await client.batch([{ sql: 'SELECT id FROM games WHERE id=?', params: [7], mode: 'get' }]);
  assert.deepEqual(batch[0].rows[0], { id: 7 });
  assert.equal(requests.at(-1).url, '/internal/v1/batch');
  console.log('PASS Data API client protocol: health, auth header, id-only query protocol, CRUD response and transaction batch');
} finally {
  client.close();
  await new Promise((resolve) => server.close(resolve));
}
