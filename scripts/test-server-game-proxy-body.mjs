import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
const proxy = await fs.readFile(new URL('../src/server-game-runtime.js', import.meta.url), 'utf8');
const manager = await fs.readFile(new URL('../runtime-service/server.js', import.meta.url), 'utf8');

assert.match(server, /const captureRawBody = \(req, _res, buffer\) => \{ req\.rawBody = Buffer\.from\(buffer\); \}/, 'Express must preserve parsed request bytes');
assert.match(server, /express\.json\(\{ limit: '300kb', verify: captureRawBody \}\)/, 'JSON body parser must capture raw bytes');
assert.match(proxy, /if \(Buffer\.isBuffer\(req\.rawBody\)\)[\s\S]*?upstream\.end\(req\.rawBody\)/, 'platform proxy must replay parsed bytes');
assert.match(proxy, /Runtime manager returned HTTP \$\{response\.statusCode\} for \$\{method\} \$\{pathname\}/, 'runtime manager errors must identify request path');
assert.match(manager, /server\.on\('clientError',[\s\S]*?HTTP parser rejected request/, 'HTTP parser 400 responses must be logged');
console.log('PASS server-game proxy body: parsed JSON bytes replayed, request path diagnostics and HTTP parser errors logged');
