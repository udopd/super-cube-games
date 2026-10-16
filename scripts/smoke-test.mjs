const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const checks = [
  ['catalog page', '/', 'text/html'],
  ['hero page', '/hero.html', 'text/html'],
  ['login page', '/login.html', 'text/html'],
  ['documentation page', '/documentation.html', 'text/html'],
  ['SDK page', '/sdk.html', 'text/html'],
  ['public leaderboard', '/leaderboard.html', 'text/html'],
  ['bootstrap API', '/api/bootstrap', 'application/json'],
  ['public games API', '/api/games', 'application/json'],
  ['public leaderboard API', '/api/leaderboard', 'application/json'],
  ['robots.txt', '/robots.txt', 'text/plain'],
  ['sitemap.xml', '/sitemap.xml', 'application/xml']
];
let failed = 0;
for (const [name, route, expectedType] of checks) {
  try {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes(expectedType)) {
      failed += 1; console.error(`FAIL ${name}: HTTP ${response.status}, content-type=${type}`); continue;
    }
    if (route === '/api/bootstrap') {
      const payload = await response.json();
      if (!payload.csrfToken || !payload.providers) { failed += 1; console.error('FAIL bootstrap API: csrfToken/providers missing'); continue; }
    } else if (route === '/api/games') {
      const payload = await response.json();
      if (!Array.isArray(payload.games) || !Array.isArray(payload.tags)) { failed += 1; console.error('FAIL public games API: games/tags arrays missing'); continue; }
    } else if (route === '/api/leaderboard') {
      const payload = await response.json();
      if (!Array.isArray(payload.players)) { failed += 1; console.error('FAIL leaderboard API: players array missing'); continue; }
    }
    console.log(`PASS ${name}: ${response.status}`);
  } catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
for (const route of ['/admin.html','/admin/metrics','/admin/recommendations']) {
  try {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    if (![302,303,401,403].includes(response.status)) { failed += 1; console.error(`FAIL private page guard ${route}: expected redirect/block, got ${response.status}`); }
    else console.log(`PASS private page guard ${route}: ${response.status}`);
  } catch (error) { failed += 1; console.error(`FAIL private page guard ${route}: ${error.message}`); }
}
try {
  const response = await fetch(`${baseUrl}/api/admin/games`, { redirect: 'manual' });
  if (response.status !== 403) { failed += 1; console.error(`FAIL admin API protection: expected 403, got ${response.status}`); }
  else console.log('PASS admin API protection: anonymous request blocked');
} catch (error) { failed += 1; console.error(`FAIL admin API protection: ${error.message}`); }
if (failed) { console.error(`\n${failed} check(s) failed.`); process.exitCode = 1; }
else console.log('\nSmoke tests passed.');
