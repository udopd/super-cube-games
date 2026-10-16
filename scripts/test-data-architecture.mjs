import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFile(path.join(root, name), 'utf8');
const [compose, platformDockerfile, dataDockerfile, dbModule, dataServer, schema, auth] = await Promise.all([
  read('docker-compose.yml'), read('Dockerfile'), read('Dockerfile.data-api'),
  read('src/db.js'), read('data-service/server.js'), read('data-service/schema.sql'), read('src/auth.js')
]);

assert.match(compose, /^  postgres:/m, 'Compose must include PostgreSQL');
assert.match(compose, /^  data-api:/m, 'Compose must include the Data API');
assert.match(compose, /^  platform:/m, 'Compose must include the Platform API');
const dataService = compose.match(/^  data-api:\n([\s\S]*?)(?=^  platform:)/m)?.[1] || '';
const platformService = compose.match(/^  platform:\n([\s\S]*?)(?=^volumes:)/m)?.[1] || '';
assert.ok(dataService, 'Could not locate the Data API service in Compose');
assert.ok(platformService, 'Could not locate the Platform API service in Compose');
assert.doesNotMatch(dataService, /^\s+ports:/m, 'Data API must not publish a host port');
assert.doesNotMatch(platformService, /^\s+DATABASE_URL:/m, 'Platform API must not receive DATABASE_URL');
assert.doesNotMatch(platformService, /^\s+POSTGRES_PASSWORD:/m, 'Platform API must not receive the database password');
assert.match(dataService, /^\s+DATABASE_URL:/m, 'Data API must receive DATABASE_URL');
assert.match(platformDockerfile, /delete p\.dependencies\.pg/, 'Platform image should not install the PostgreSQL driver');
assert.match(dataDockerfile, /COPY data-service\/package\.json/, 'Data API image must have its isolated package manifest');
assert.match(dbModule, /DataApiClient|createDatabase/, 'Application DB module must expose the Data API client');
assert.doesNotMatch(dbModule, /from\s+['"]pg['"]|better-sqlite3/, 'Platform DB module must not import a database driver');
assert.match(dataServer, /queryCatalog\[queryId\]/, 'Data API must enforce the registered query allowlist');
assert.match(dataServer, /timingSafeEqual/, 'Data API internal token comparison should be constant time');
assert.match(dataServer, /PARAMETER_COUNT_MISMATCH/, 'Data API must verify exact parameter counts');
assert.match(schema, /CREATE TABLE IF NOT EXISTS app_sessions/, 'Sessions should be persisted in PostgreSQL');
assert.match(schema, /CREATE TABLE IF NOT EXISTS metric_snapshots/, 'Metric history should be persisted in PostgreSQL');
assert.match(auth, /async function ensureIdentity\(/, 'Auth must use an idempotent provider-identity helper');
assert.match(auth, /ON CONFLICT\(provider, provider_subject\) DO NOTHING/, 'Repeated provider identity inserts must be idempotent for PostgreSQL');
assert.match(auth, /SELECT user_id FROM identities WHERE provider=\? AND provider_subject=\?/, 'Auth must verify the existing identity owner after an insert/conflict');
assert.doesNotMatch(auth, /includes\('UNIQUE'\)/, 'Auth must not depend on SQLite-specific duplicate error text');
console.log('PASS data architecture: platform/data isolation, private allowlisted Data API, PostgreSQL sessions/metrics, and idempotent safe identity linking');
