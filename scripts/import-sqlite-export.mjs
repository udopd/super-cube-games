import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-sqlite-export.mjs migration-export.json');
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to the target PostgreSQL database.');
const document = JSON.parse(await fs.readFile(file, 'utf8'));
if (document.formatVersion !== 1 || !document.tables || typeof document.tables !== 'object') throw new Error('Unsupported migration export format.');
const order = ['users','identities','games','play_sessions','game_events','ratings','reviews','favorites','cloud_saves','email_codes','metric_snapshots'];
const allowed = new Set(order);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2,
  ...(process.env.DATABASE_SSL === '1' ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== '0' } } : {}) });
const client = await pool.connect();
let total = 0;
try {
  await client.query('BEGIN');
  for (const table of order) {
    const item = document.tables[table];
    if (!item) continue;
    if (!allowed.has(table) || !Array.isArray(item.columns) || !Array.isArray(item.rows)) throw new Error(`Invalid export table: ${table}`);
    const metadata = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
    const known = new Set(metadata.rows.map((row) => row.column_name));
    const columns = item.columns.filter((column) => known.has(column) && /^[a-z_][a-z0-9_]*$/i.test(column));
    if (!columns.length || item.rows.length === 0) {
      console.log(`Skipped ${table}: no compatible rows/columns`);
      continue;
    }
    let count = 0;
    for (const row of item.rows) {
      const selected = columns.filter((column) => Object.hasOwn(row, column));
      if (!selected.length) continue;
      const values = selected.map((column) => row[column] === undefined ? null : row[column]);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
      const sql = `INSERT INTO "${table}" (${selected.map((name) => `"${name}"`).join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      await client.query(sql, values);
      count += 1;
    }
    if (columns.includes('id')) {
      await client.query(`SELECT setval(pg_get_serial_sequence('public."${table}"','id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"),1),1), EXISTS(SELECT 1 FROM "${table}"))`);
    }
    total += count;
    console.log(`Processed ${table}: ${count} row(s) attempted`);
  }
  // Backfill fields that were added in newer platform versions.
  await client.query(`UPDATE games SET description_en=description WHERE description_en=''`);
  await client.query(`UPDATE games SET description_ru=description WHERE description_ru=''`);
  await client.query(`UPDATE games SET tags_en_json=tags_json WHERE tags_en_json='[]' AND tags_json<>'[]'`);
  await client.query(`UPDATE games SET tags_ru_json=tags_json WHERE tags_ru_json='[]' AND tags_json<>'[]'`);
  const missingIds = await client.query(`SELECT id FROM users WHERE public_id IS NULL OR public_id=''`);
  const usedIds = new Set((await client.query(`SELECT public_id FROM users WHERE public_id IS NOT NULL AND public_id<>''`)).rows.map((row) => row.public_id));
  for (const user of missingIds.rows) {
    let publicId;
    do { publicId = `SC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; } while (usedIds.has(publicId));
    usedIds.add(publicId);
    await client.query('UPDATE users SET public_id=$1 WHERE id=$2', [publicId, user.id]);
  }
  await client.query('COMMIT');
  console.log(`Migration import finished. ${total} row(s) considered. Verify record counts before switching traffic.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
