import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(root, file), 'utf8');
const [auth, browserAuth, loginHtml, host, sdk, generator, dataApi] = await Promise.all([
  read('src/auth.js'), read('public/js/auth.js'), read('login.html'),
  read('public/js/game-host.js'), read('public/js/game-sdk.js'), read('scripts/build-query-catalog.mjs'), read('data-service/server.js')
]);
assert.match(auth, /req\.body\?\.mode === 'register' \? 'register' : 'login'/, 'email flow must distinguish sign-in and registration');
assert.match(auth, /sha256\(`\$\{mode\}:\$\{email\}:\$\{code\}:/, 'OTP must be bound to the requested flow');
assert.match(auth, /ON CONFLICT\(email\) DO UPDATE SET code_hash=excluded\.code_hash, expires_at=excluded\.expires_at, attempts=0/, 'requesting a fresh code must replace the old code and reset attempts');
assert.match(auth, /ON CONFLICT\(provider, provider_subject\) DO NOTHING/, 'identity creation must be idempotent');
assert.match(browserAuth, /resendCodeButton/, 'login flow must provide resend/reset-code action');
assert.match(loginHtml, /id="loginModeButton"/);
assert.match(loginHtml, /id="registerModeButton"/);
assert.match(loginHtml, /id="changeEmailButton"/);
assert.match(host, /const routeMatch = location\.pathname\.match/, 'game identity should derive from pathname');
assert.match(host, /cleanUrl\.searchParams\.delete\('src'\)/, 'src attribution must not stay in the canonical game URL');
assert.match(host, /api\(`\/api\/games\/\$\{encodeURIComponent\(slug\)\}\/save`/, 'cloud saves must use canonical slug');
assert.match(sdk, /const slug = params\.get\('slug'\) \|\| ''/, 'SDK save key must use the server-injected slug');
assert.match(generator, /DO\\s\+NOTHING/, 'query catalog builder must recognize idempotent inserts');
assert.match(dataApi, /if \(mode === 'run' && item\.returnsId/, 'Data API should append RETURNING id only when the catalog marks it appropriate');
console.log('PASS auth/game contract: explicit sign-in and registration, repeatable OTP reset, idempotent identities and query-independent game save identity');
