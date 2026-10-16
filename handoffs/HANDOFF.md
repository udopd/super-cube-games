# HANDOFF — SUPER CUBE Games Platform

**Updated:** 2026-10-11. This is a source-code MVP, not a deployed production service. Read `README.md`, `PROJECT_DESCRIPTION.md`, and this file first.

## Product scope

A self-hosted web-game catalogue with one admin (`ADMIN_EMAIL`), draft upload/private test/publish lifecycle, player accounts, ratings/reviews/favourites/cloud saves, public leaderboard, analytics, bilingual descriptions/tags, browser games in sandboxed iframes, and isolated per-game Docker runtimes for server-authoritative games.

## Current architecture

- Node.js >=20, Express 4, PostgreSQL 16, private internal Data API, PostgreSQL-backed Express sessions, vanilla HTML/CSS/JS.
- `server.js` is the Platform API and contains no PostgreSQL driver. It waits for Data API readiness at start-up.
- `shared/data-client.js` sends only registered query SHA IDs, mode and parameters; `data-service/query-catalog.json` is the SQL allowlist generated from static query strings.
- `data-service/server.js` alone imports `pg`, applies `data-service/schema.sql`, validates the allowlist and parameter count, and executes SQL. `/internal/v1/batch` wraps statements in a PostgreSQL transaction. `/internal/v1/sessions/*` backs Express sessions in `app_sessions`.
- `docker-compose.yml`: three services — Platform API, private Data API and PostgreSQL 16. Data API has no host port binding; only Platform API publishes port 3000. PostgreSQL is bound to localhost for migration tooling.
- Uploaded game files and avatars remain on persistent local/Compose volume at this stage. Object storage and a separate restricted runtime-manager are follow-up architecture work, not yet implemented.
- `server.js`: routes, authentication bootstrap, secure assets, game-host bridge, admin APIs, SEO, runtime proxy and ping endpoint.
- `src/db.js`: Platform API Data API client export (no DB driver/schema).
- `shared/data-client.js`: remote allowlisted SQL API client (`prepare().get/all/run`, atomic `batch`).
- `shared/data-api-session-store.js`: Express session store over internal Data API session endpoints.
- `data-service/server.js`: private PostgreSQL service, schema bootstrapping, statement allowlist, safe parameter count, batch transactions and sessions.
- `data-service/schema.sql`: PostgreSQL schema/indexes.
- `scripts/build-query-catalog.mjs`: derives stable SHA-256 IDs for static statements; `data-service/query-catalog.json` is generated.
- `scripts/export-sqlite.py` + `scripts/import-sqlite-export.mjs`: manual one-time migration from a legacy SQLite DB.
- `src/auth.js`: email OTP and password authentication.
- `src/security.js`: CSRF, origin checks, escaping and input sanitation.
- `src/games.js`: bounded ZIP extraction, traversal/symlink/compression checks, bilingual metadata and capsule validation.
- `src/analytics.js`: session-derived playtime, scoring, per-game metrics, leaderboard, current CCU and trend data.
- `src/server-game-runtime.js`: authenticated HTTP client for the dedicated runtime manager; status, start/stop, HTTP and WebSocket proxy.
- `runtime-service/server.js`: dedicated trusted game runtime controller, scoped internal API, per-game network and isolated volume/container lifecycle. This is the only container mounting Docker Engine socket.
- `public/`: catalog, hero, login, player profile, admin page, SDK docs, product documentation, leaderboard and browser code.
- `private-pages/`: admin-only metrics dashboard and recommendations page (served through guarded Express routes).
- `examples/pocket-clicker.zip`: browser SDK sample.
- `examples/durak-online.zip`: 2–6 player server-side card game example. Its room state is in memory and resets on container restart.

## Canonical game ZIP format

```text
my-game.zip
├── index.html
├── runtime.txt                 # optional: browser (default) | server
├── media/
│   ├── title.txt               # English title only
│   ├── description.ru.txt
│   ├── description.en.txt
│   ├── tags.ru.txt
│   ├── tags.en.txt              # catalogue always uses English tags
│   ├── capsule.jpg              # JPG/GIF, exactly 630 × 500
│   ├── promo.png                # other promotional artwork
│   └── screenshots/             # screenshots shown in game modal
└── server/                      # required if runtime.txt=server
    └── index.js                 # binds 0.0.0.0:3000 inside the container
```

The parser prefers metadata inside `media/` and keeps a legacy reader for older uploaded packages. New ZIPs should use only the canonical structure. The admin editor updates localized metadata under `media/`. The ZIP limit is 100 MiB; extracted size is limited to 250 MB and 2,000 entries.

## Main UX and API work in the latest revision

- `/hero.html` is a no-scroll hero page with the interactive 3D Rubik's Cube copied/adapted from `SUPER_CUBE_NotesNavigation.html`. Theme/language persist; scramble animation has been removed.
- `/documentation.html` contains product/architecture/operations documentation and links to the standalone bilingual SDK page `/sdk.html`. The SDK page has Browser/Server tabs, integration examples and prompts for new-game creation and existing-ZIP conversion.
- `/admin/metrics` shows platform/game KPIs, animated counters, game comparison charts, platform 24-hour CCU, game CCU series and 30-day daily-player history. Minute snapshots begin when this revision is running; prior history is not backfilled.
- `/admin/recommendations` is admin-only. Admin can open game details in the modal, edit RU/EN metadata, preview, publish/unpublish/delete, and inspect the archive size in bytes/KB/MB.
- Catalog game Play anchors navigate straight to the game; clicking the capsule/card opens its modal. Play buttons are green. Server-game ping is displayed where available.
- Player avatar source is required to be exactly 512×512 in the browser; the client converts it to a 64×64 WebP derivative and the server validates that derivative before storage. Reviews display the avatar.
- `window.SuperCubePlatform` includes `getUser`, `save`, `loadSave`, `rate`, `review`, `favorite`, `share`, `recordClick` and `track`. Guest `getUser()` resolves to an anonymous identity and guest `loadSave()` returns a structured sign-in-required result.
- Review submit no longer uses `event.currentTarget` after an async wait; it captures the form before sending. Multiple top-level comments are supported; players can edit only their own comments; admin can remove any comment and reply.
- The clicker example now loads account identity separately from cloud saves, so a guest save failure does not replace player identity with an error.
- Published server games are pre-warmed on platform startup where possible and lazily started on first request. They stop on unpublish/delete. Platform API does not invoke Docker locally; it calls the internal `game-runtime` service with `SERVER_GAME_RUNTIME_TOKEN`. Only that dedicated service mounts `/var/run/docker.sock`. Each game receives its own isolated internal Docker network and its own read-only data volume. Game server listens on `0.0.0.0:3000` and is reverse-proxied through the runtime manager; no host port is published for the game. `/api/games/:slug/ping` provides state/latency.
- Server game API paths have a narrow CORS exception for opaque-origin sandboxed frames, including `Origin: null`; all ordinary write APIs retain CSRF/Origin checks.

## Scoring and analytics semantics

Player points are calculated server-side from recorded session seconds, the longest top-level review per game, distinct favourite-add events per game, distinct shares per game, and accumulated full-hour bonuses. Public leaderboard exposes only public player ID, nickname and points. Admin-only player detail includes email, time per game, saves, events and share history.

Session duration is derived from server-side play sessions and bounded heartbeats; heartbeat accumulation is intended only while the document is visible/focused. It mitigates accidental background time and simple client-side claims, but is not anti-bot proof. For meaningful prizes, add anomaly detection and abuse review.

Metric snapshot history begins only after this version starts. Daily players are derived from session dates; CCU snapshots are written approximately once a minute based on sessions seen within the recent heartbeat window.

## Running locally

Recommended path (Docker Engine + Docker Compose):

```bash
cd super-cube-platform
cp .env.example .env
# Set SESSION_SECRET, OTP_PEPPER, DATA_API_TOKEN (32+ random chars), POSTGRES_PASSWORD and ADMIN_EMAIL.
docker compose up --build
```

This starts PostgreSQL, a private Data API and Platform API. The platform waits until Data API is healthy. To run Node processes outside Compose, start PostgreSQL, then run `npm install`, `npm run start:data`, and in a second terminal `npm start`; set `DATABASE_URL` and `DATA_API_URL` to localhost. The old SQLite file is not auto-converted; use export/import scripts described in README. The standalone /sdk.html page has RU/EN switching; /documentation.html links to it from the contents, tools section and footer. Open `http://localhost:3000/`. Server runtime requires Docker Engine and a locally available `node:22-alpine` image (or configure `SERVER_GAME_DOCKER_IMAGE`). Inside the container the game server listens on port 3000; game dependencies must be bundled because container network egress is disabled. Docker was not available in the editing environment, so automatic Docker launch has not been integration-tested here.

## Verification performed in this revision

- `npm run check` passes Node syntax checks for server modules, all listed frontend JS files, and the Durak client/server.
- Extracted inline JavaScript from `public/hero.html` and `public/sdk.html`; both passed `node --check`.
- Direct HTTP smoke test of `examples/durak-online/server/index.js` passed: health endpoint, room creation/join, start, distinct private hands, attack validation, rejection of defense before attack closes, and end-attack action.
- Canonical `examples/pocket-clicker.zip` and `examples/durak-online.zip` contain metadata files under `media/`; the capsule format/dimensions should be checked again after repackaging.
- Full application runtime/API/PostgreSQL smoke test was **not** completed: npm dependency installation timed out in this environment, no `node_modules`, Docker Engine or PostgreSQL server are available. SMTP and Docker startup still require credentials/services and dedicated end-to-end testing.

## Next steps before production

1. Run `npm install` in a network-enabled environment; run `npm run check` and `npm run smoke`.
2. Run end-to-end platform upload → draft → private test → publish → catalog with PostgreSQL/Data API. Test data export/import against a copy of a pre-existing SQLite database.
3. Verify unauthenticated draft-page and draft-asset denial; test share/review/favorite/save/profile avatar and player scoring through the actual UI.
4. Test dedicated game-runtime manager with Docker installed: Docker socket mount on Docker Desktop, storage-volume discovery, launch/proxy/WebSocket, ping, readiness timeout, stop on unpublish/delete, restart warmup and isolation tests. The Docker socket grants powerful host control; keep the manager internal and token-protected.
5. Test SMTP OTP expiration/attempt limits, CSRF, ZIP path tricks, and upload size limits.
6. Add malware scanning, content moderation, privacy policy/terms, backup restore drills, monitoring, CDN/WAF, network-level DDoS protection and ideally a separate origin for user-generated game content.

## Prompt for the next chat

> Продолжаем SUPER CUBE Games Platform из архива. Сначала изучи `README.md`, `PROJECT_DESCRIPTION.md` и `HANDOFF.md`. Не переписывай проект заново: сначала поставь npm-зависимости и проведи настоящие runtime/integration tests. Проверь canonical archive layout (все пять metadata-файлов внутри `media/`), админский upload → private draft → publish, карточку игры/отзывы/аватары, SDK и clicker save/user UI, метрики/leaderboard, и server-game lifecycle под Docker. Сейчас синтаксические проверки и автономные HTTP-тесты «Дурака» пройдены. Для этой ревизии нужно прогнать `npm run test:unit`, Compose health checks и `npm run smoke` с настоящим PostgreSQL/Docker: эта среда не имеет npm-пакетов, Docker Engine или PostgreSQL сервера. Не утверждай, что SMTP работает без credentials и end-to-end tests. Учитывай `Origin: null` только для server-game runtime API и сохраняй CSRF/Origin защиту обычных write API.


## PostgreSQL identity-conflict fix (2026-10-11)

- Fixed repeat email-code sign-in when the email identity already exists in PostgreSQL. The old code matched SQLite error text containing `UNIQUE`; PostgreSQL reports SQLSTATE `23505` and a different message.
- Added `ensureIdentity()` to insert using `ON CONFLICT(provider, provider_subject) DO NOTHING`, then verify that the existing identity belongs to the expected user. Conflicts across accounts are not silently reassigned.
- The Data API query catalog has been regenerated (94 registered statements). Regression assertions were added to `scripts/test-data-architecture.mjs`.
- To apply this fix to an existing deployment, replace the updated source files and rebuild the `platform` and `data-api` services. Keep the existing `.env` and PostgreSQL volume; no schema migration or data deletion is needed.


## Regression fixes — email OTP and canonical game identity (2026-10-11)

- Email auth UI now has explicit Sign in / Create account modes. Email-code requests are mode-bound in the hash; requesting a new code replaces the active challenge and resets attempts without deleting the account. Existing accounts must use Sign in; registration refuses an already registered email.
- Email verify first resolves an existing `provider=email` identity, then falls back to the user email, and never silently reassigns an identity across accounts. The query-catalog builder no longer auto-appends `RETURNING id` to `ON CONFLICT ... DO NOTHING` inserts.
- Rebuilt query allowlist contains 94 registered statements. `npm test` passed in this environment, including `scripts/test-auth-game-contract.mjs` (contract/static regression assertions). A live PostgreSQL email-flow test could not be run without Docker/PostgreSQL and real SMTP.
- `game-host.js` takes the canonical slug from `/games/<slug>` rather than interpreting `src` as identity, preserves source in its script configuration for analytics, and removes `src` from the visible URL. The SDK continues using the server-injected slug for save/load. Both `/games/pocket-clicker` and `/games/pocket-clicker?src=catalog` therefore target the same `games.id`/cloud-save row.
- Existing deployment should keep `.env` and Docker volumes, then run `docker compose build --no-cache platform data-api` and `docker compose up -d --force-recreate platform data-api` to prevent an old image/query catalogue from continuing to issue the pre-fix INSERT.


## Runtime-manager follow-up (2026-10-11)

- Fixed `spawn docker ENOENT` by removing all Docker CLI usage from the Platform API container.
- Added `Dockerfile.runtime` and `runtime-service/server.js`; Compose service `game-runtime` is the only service with `docker-cli` and `/var/run/docker.sock`.
- Platform API uses `SERVER_GAME_RUNTIME_URL` + `SERVER_GAME_RUNTIME_TOKEN` over the Compose network.
- Game containers have no published host ports; runtime manager proxies HTTP/WebSocket on the isolated internal network. Each game receives a fresh per-game volume copied from `platform-storage`; the game cannot read other drafts/files.
- New required `.env` value: `SERVER_GAME_RUNTIME_TOKEN` (unique random secret, at least 32 chars), shared between `platform` and `game-runtime`.
- Validation: `npm test` passes with static architecture checks. Docker Desktop socket mount and full Compose runtime cannot be tested in this environment and must be confirmed on the user's machine with `docker compose exec game-runtime docker info`.


## Runtime manager diagnostic fix (2026-10-11)

- A concrete permission mismatch was found in server-game startup: safe ZIP extraction creates files with mode `0640`, while game containers run under UID/GID `10001`. The copied files could not be read by that UID, causing the Node entry point to exit immediately and the UI to show only `Game runtime operation failed.`.
- The per-game copy step now runs `chmod -R a+rX /dst` on the isolated copy (only read/execute bits needed for access; the volume remains mounted read-only to the game). This does not loosen permissions on the platform storage volume.
- Game containers are no longer launched with `--rm`; stale containers are removed before each new start and clean-up explicitly removes them. If readiness fails, runtime manager captures the tail of stdout/stderr logs before stop/removal and includes a bounded detail in development responses.
- Platform-side runtime client now preserves a development-only `payload.detail`, so `server.js` logs the actual cause instead of discarding it. Production user-facing errors remain generic; full diagnostics stay in `docker compose logs game-runtime`.
- Added static regression tests that require permission normalization, start-log capture and detail propagation. `npm test` passed. Full Docker Engine/game-container integration could not be run in this environment.

### Troubleshooting after deployment

```powershell
docker compose build --no-cache game-runtime platform
docker compose up -d --force-recreate game-runtime platform
docker compose logs --tail=200 game-runtime platform
docker compose exec game-runtime docker info
```

The fix does not require deleting PostgreSQL or any Compose volumes.


## Latest runtime proxy fix (2026-10-11)

The uploaded Docker logs confirmed that Durak server process starts. Fixed proxying of JSON POST bodies: Express parsers now preserve raw bytes, and the platform proxy replays those bytes with an accurate Content-Length instead of piping an already-consumed request stream. Added runtime manager request/status logging and HTTP parser error logging to diagnose remaining HTTP 400 responses. See `HANDOFF_RUNTIME_PROXY_BODY_FIX.txt`.


## 2026-10-11 UI update

- Play buttons have no decorative arrows and use the light-green selection accent.
- Admin game upload and archive replacement show byte-accurate progress and warn before page exit during transfer/processing.
- Email OTP and password login appear on the sign-in page; back links use same-origin browser history when available.
- Leaderboard score info opens on hover/focus, still usable by click/touch.
- SDK is a standalone `/sdk.html` developer page with RU/EN switching, Browser/Server tabs, integration examples and new/convert-existing-archive AI prompts. `/documentation.html` links to it from the contents, tools section and footer; the docs header excludes Catalog/Leaderboard navigation.


## Admin dashboard and standalone SDK revision (2026-10-11)

- Kept the developer SDK on standalone `/sdk.html`; documentation links to it in the table of contents, tools section and footer. Documentation page header no longer displays Catalog or Leaderboard navigation.
- `/admin/metrics` has two dashboard tabs (Games and Platform status), user-rearrangeable widgets, collapse/hide/restore controls persisted to localStorage, bounded internal scroll regions for logs, a per-game unique-players-today pie chart with hover/focus descriptions, and a separate platform/game errors widget.
- Monitoring language refreshes when `sc:language` fires. Admin and leaderboard UI does not show the administrator's email. Game title and runtime type are separate columns; game modal Play/Share actions sit below the capsule.
- Error widget data sources: up to 100 in-memory unhandled Platform API errors, error-like application events, and server-game runtime status errors. Platform API error history is not persistent and is cleared on restart. Docker stdout/stderr is still read using Docker Compose logs, not directly in the dashboard.
- Validation after these changes: `npm test` passes, including the UI regression test. No live browser or Docker integration was performed in this environment.

## Latest dashboard + docs update (2026-10-11)

- Widget grid uses two columns in landscape; touch/mouse/pointer grip moves widgets. Hiding/collapse/order persist via localStorage; reset action removed.
- Per-game pie shows unique players today; platform CCU is shown separately in history charts. Daily player chart includes 7-day trend. Median/rating comparison filters support game and canonical English tag selection.
- `/documentation.html` has the complete grouped API endpoint catalogue with expandable request examples. `/sdk.html` remains standalone and includes per-method examples + complete clicker demo.
- Theme preboot, catalog filter persistence, improved favorite toasts, support form success close/toast and responsive UI refinements are included.
- `npm test` passes. Browser and live Docker/PostgreSQL E2E checks remain to be performed. Recommend OpenAPI 3.1 as future endpoint source of truth and persistent structured error logging with retention/alerts.


## 2026-10-11 — Header and dashboard heading layout refinement

- Fixed dashboard widget header DOM structure: each widget now has dedicated `.dashboard-widget-heading` and `.dashboard-widget-controls` wrappers, preventing action buttons from squeezing the title into a narrow column.
- Desktop widget titles use the flexible middle grid track; action buttons remain compact and intrinsically sized on the right. On mobile, controls move to a second row so the title can use nearly the full card width.
- `public/js/common.js` now normalizes topbar navigation and actions into `.header-menu-content` and injects an accessible hamburger toggle on pages with a shared topbar.
- Desktop header actions now have intrinsic content width and remain right-aligned. At viewport widths <=760px, nav and controls become a dropdown menu; it closes on link navigation, Escape, or an outside pointer interaction. The burger label tracks RU/EN changes.
- Added regression assertions for the normalized widget heading/control structure and responsive header menu.
- Validation: `npm test` passed (query catalog, syntax checks, Data API contract, architecture tests, auth/game contract, server runtime, proxy body and UI regressions).
- Browser visual testing in an actual Docker Desktop deployment has not been performed in this environment; verify desktop/tablet/mobile widths after deployment.
