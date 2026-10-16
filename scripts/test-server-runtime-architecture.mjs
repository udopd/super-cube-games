import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFile(path.join(root, name), 'utf8');
const [compose, platformRuntime, runtimeService, dockerfile, platformDockerfile, client] = await Promise.all([
  read('docker-compose.yml'), read('src/server-game-runtime.js'), read('runtime-service/server.js'),
  read('Dockerfile.runtime'), read('Dockerfile'), read('server.js')
]);
const gameService = compose.match(/^  game-runtime:\n([\s\S]*?)(?=^  platform:)/m)?.[1] || '';
const platformService = compose.match(/^  platform:\n([\s\S]*?)(?=^volumes:)/m)?.[1] || '';
assert.ok(gameService, 'Dedicated game-runtime service must exist');
assert.match(gameService, /Dockerfile\.runtime/, 'Runtime manager must use its own Docker image');
assert.match(gameService, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/, 'Only runtime manager should mount Docker socket');
assert.match(gameService, /platform-storage:\/app\/storage:ro/, 'Runtime manager must access platform game files read-only');
assert.doesNotMatch(platformService, /docker\.sock/, 'Platform API must not mount Docker socket');
assert.match(platformService, /SERVER_GAME_RUNTIME_URL: http:\/\/game-runtime:4100/, 'Platform must use internal runtime manager URL');
assert.match(platformService, /SERVER_GAME_RUNTIME_TOKEN:/, 'Platform must authenticate to the runtime manager');
assert.doesNotMatch(platformRuntime, /spawn\(['\"]docker/ , 'Platform runtime client must not spawn Docker directly');
assert.match(platformRuntime, /requestRuntime\(/, 'Platform runtime client must call internal manager API');
assert.match(runtimeService, /--network.*network/, 'Game containers must run in a dedicated network');
assert.match(runtimeService, /--cpus=0\.50/ , 'Game CPU limits must remain enforced');
assert.match(runtimeService, /--memory=256m/ , 'Game memory limits must remain enforced');
assert.match(runtimeService, /--cap-drop=ALL/ , 'Game containers must drop Linux capabilities');
assert.match(runtimeService, /chmod -R a\+rX \/dst/, 'Copied archive files must be readable by the unprivileged game UID');
assert.match(runtimeService, /gameContainerLogs/, 'Startup failures must capture container logs before cleanup');
assert.match(platformRuntime, /payload\.detail/, 'Platform logs must preserve development details from runtime manager');
assert.match(runtimeService, /timingSafe|awaitSafeTimingEqual/, 'Runtime manager must authenticate internal calls');
assert.match(dockerfile, /docker-cli/, 'Only runtime manager image should install Docker CLI');
assert.doesNotMatch(platformDockerfile, /docker-cli|docker\.sock/, 'Platform image must not contain Docker CLI/socket setup');
assert.match(client, /serverGameStatus/, 'Platform ping route must use manager status');
console.log('PASS server runtime boundary: Docker socket isolated to internal runtime manager, API token auth, per-game network/resource limits');
