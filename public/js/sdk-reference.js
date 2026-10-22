(() => {
  'use strict';
  const root = document.getElementById('sdkReferenceContent');
  if (!root) return;
  const examples = {
    browser: `<!-- Put these controls in your index.html; the platform SDK is injected automatically. -->
<p id="score">Level 1 · Score 0</p>
<button id="complete-level" type="button">Complete level</button>
<script>
// SUPER CUBE automatically injects window.SuperCubePlatform into your game.
// Do not copy cookies, add private API URLs, or include a separate SDK bundle.
const scoreLabel = document.querySelector('#score');
const completeButton = document.querySelector('#complete-level');
let state = { level: 1, score: 0 };

function render(state) {
  if (scoreLabel) scoreLabel.textContent = 'Level ' + state.level + ' · Score ' + state.score;
}

async function initialiseGame() {
  try {
    const player = await window.SuperCubePlatform.getUser();
    if (player.authenticated) {
      const result = await window.SuperCubePlatform.loadSave();
      if (result?.save) state = { ...state, ...result.save };
    }
    render(state);
  } catch (error) {
    console.error('Could not load cloud progress', error);
  }
}

completeButton?.addEventListener('click', async () => {
  state.level += 1;
  state.score += 100;
  render(state);
  try {
    await window.SuperCubePlatform.track('level_complete', { label: String(state.level) });
    const player = await window.SuperCubePlatform.getUser();
    if (player.authenticated) await window.SuperCubePlatform.save(state);
  } catch (error) {
    console.error('Could not sync progress', error);
  }
});
initialiseGame();
</script>`,
    server: `// server/index.js — authoritative Node.js runtime
import http from 'node:http';
const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (req, res) => {
  // Validate route, room membership, player permissions and payload.
  // Never trust scores, current turn or player IDs supplied by a client.
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});
server.listen(port, '0.0.0.0', () => {
  console.log('Game server listening on 0.0.0.0:' + port);
});`
  };
  const text = {
    ru: {
      browser: 'Простые браузерные игры', server: 'Серверные игры', browserTitle: 'Когда выбирать браузерный runtime',
      browserDesc: 'Используй его для одиночных и небольших игр, логика которых может безопасно выполняться в браузере. Платформа размещает файлы в sandboxed iframe и автоматически подключает SDK. Не храни в клиенте данные, которым нужно доверять: результаты, награды и критичный прогресс.',
      serverTitle: 'Когда нужен серверный runtime', serverDesc: 'Выбирай серверную игру, когда нужны авторитетное многопользовательское состояние, комнаты, синхронизация или серверная проверка ходов. Сервер игры запускается в отдельном контейнере; его порт 3000 внутри контейнера не совпадает с портом сайта.',
      requirements: 'Формат и требования', reqBrowser: ['index.html в корне архива.', 'Промоматериалы — в media/. Обязательна media/title.txt с английским названием, description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt и capsule.jpg или capsule.gif размером ровно 630 × 500.', 'Внутренние ассеты подключай относительными URL; не используй абсолютный localhost.', 'Сохранения, оценки, отзывы, избранное и события доступны через window.SuperCubePlatform.'],
      reqServer: ['runtime.txt со строкой server и файл server/index.js.', 'Слушай process.env.PORT || 3000 и привязывай сервер к 0.0.0.0.', 'Клиентские ресурсы используй по относительным URL, чтобы они работали за runtime-прокси.', 'Правила игры и проверка ходов выполняются на сервере; клиент отправляет намерения и отображает полученное состояние.', 'Не подключайся напрямую к PostgreSQL или внутреннему Data API платформы.'],
      architecture: 'Рекомендуемая архитектура серверной игры', arch: [
        'Разделяй транспортный слой и чистую игровую логику: проверить схему запроса → проверить сессию/членство в комнате → применить переход состояния → вернуть безопасное состояние.',
        'Сервер определяет активного игрока, допустимость карты/хода, победителя, награды и исход матча. Входные данные клиента всегда недоверенные.',
        'Для приватной комнаты используй случайный токен приглашения. Не включай приватные комнаты в публичную выдачу и не показывай скрытые карты соперников.',
        'Определи таймауты disconnect, переподключение и передачу хоста. Очистка неактивных комнат должна выполняться на сервере.',
        'Ограничь размер сообщений, частоту запросов, память, CPU и число комнат. Логи не должны содержать токены приглашений или секреты.',
        'Не используй оперативную память контейнера как единственное долговременное хранилище сохранений. После перезапуска матч может завершиться, но данные аккаунта хранятся платформой.'
      ],
      methodsTitle: 'Методы SDK', methods: [
        ['getUser()', 'Текущий игрок', 'Возвращает authenticated, displayName и playerId. Не раскрывает email или внутренние поля администратора.'],
        ['save(data)', 'Облачное сохранение', 'Сохраняет JSON до 250 KB для авторизованного игрока и текущей игры.'],
        ['loadSave()', 'Загрузка сохранения', 'Возвращает save и updatedAt; если сохранения нет, save равен null. Для гостя может потребоваться вход.'],
        ['rate(1…5)', 'Оценка игры', 'Создаёт или обновляет оценку текущего пользователя для игры.'],
        ['review(text)', 'Отзыв', 'Добавляет отзыв. Очки за отзыв вычисляются на сервере, а не принимаются от клиента.'],
        ['favorite()', 'Избранное', 'Переключает состояние избранного для текущей игры.'],
        ['share()', 'Поделиться', 'Регистрирует событие шаринга и возвращает URL игры. Вызывай один раз на действие пользователя.'],
        ['recordClick(label)', 'Значимый клик', 'Регистрирует небольшое событие, например открытие инвентаря. Не передавай персональные данные.'],
        ["track(name, metadata)", 'События прогресса', 'Поддерживаются custom_click, level_start и level_complete. Метаданные должны быть компактными и безопасными.']
      ],
      exampleTitle: 'Пример интеграции', browserExampleTitle: 'Сохранение браузерной игры', serverExampleTitle: 'Минимальная точка входа серверной игры', showMethodExample:'Показать пример кода', hideMethodExample:'Скрыть пример кода', clickerTitle:'Полный пример: простой кликер', clickerLead:'Самодостаточная браузерная игра: счёт, загрузка/сохранение прогресса и безопасная обработка отсутствия авторизации.',
      promptsTitle: 'Промпты для нейросети', promptsLead: 'Выбери задачу. Промпт можно скопировать или скачать в Markdown; ZIP передавай ИИ при адаптации существующей игры.', promptTitle: 'SUPER CUBE Games',
      createPrompt: 'Создать новую игру', convertPrompt: 'Адаптировать существующий ZIP', copyPrompt: 'Скопировать промпт', downloadPrompt: 'Скачать .md', copied: 'Промпт скопирован', downloaded: 'Markdown-файл промпта скачан', copyError: 'Не удалось скопировать автоматически. Выдели текст и скопируй вручную.',
      promptQuality: `## Дополнительные требования к качеству
- Не ограничивайся планом или фрагментами кода: подготовь полный проект с рабочими файлами и ресурсами.
- Сделай законченный игровой цикл: понятное начало, обратная связь на действия, победа/поражение или завершение раунда, повторный запуск.
- Проверь интерфейс на узком экране и внутри iframe; обеспечь управление мышью и touch, а клавиатурное — где оно подходит игре.
- Обеспечь читаемый контраст, заметный фокус клавиатуры, масштабирование без горизонтальной прокрутки и уважение к prefers-reduced-motion.
- Не оставляй внешних зависимостей, секретов, тестовых данных, фиктивных элементов и ссылок на localhost без явной необходимости.
- Перед сдачей проверь структуру файлов, относительные пути, запуск и ошибки в консоли доступными средствами. В финале перечисли содержимое архива, реально выполненные проверки и известные ограничения; не заявляй о проверках, которые не запускались.`,
      promptServerQuality: `## Дополнительно для серверного runtime
- Клиент отправляет только намерения игрока; сервер проверяет каждое действие и возвращает безопасный снимок состояния.
- Явно определи формат сообщений, ошибки и версии протокола. Отклоняй некорректные, слишком большие и повторные запросы безопасным способом.
- Не раскрывай приватные данные, токены приглашений, скрытую информацию соперника или секреты в ответах и логах.
- Подготовь инструкции локального запуска и сценарии проверки для двух игроков, неверного хода, переподключения и завершения комнаты.`,
      newPromptBrowser: `Ты — senior HTML5 game developer. Создай завершённую адаптивную игру для SUPER CUBE Games Platform.

СНАЧАЛА
- Кратко опиши игровой цикл, управление, состояния и критерии победы/поражения.
- Реализуй все действия до рабочего состояния; не оставляй TODO и фиктивные кнопки.

АРХИВ
- В корне ZIP должны быть index.html и необходимые игровые ресурсы.
- В media/ положи title.txt (название только на английском), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt, capsule.jpg или capsule.gif размером ровно 630×500.
- Теги — короткие категории; tags.en.txt содержит английские теги. Скриншоты храни в media/screenshots/.
- Все игровые файлы и промоматериалы должны быть внутри ZIP; подключай игровые ресурсы относительными URL.

SDK И БЕЗОПАСНОСТЬ
- Используй window.SuperCubePlatform: getUser, save, loadSave, rate, review, favorite, share, recordClick, track.
- Все SDK-вызовы асинхронны. Обрабатывай ошибки через try/catch. Сохранения, оценки, отзывы и избранное доступны авторизованному игроку; гостю покажи понятное предложение войти.
- Не обращайся к приватным API напрямую, не читай cookies, не пытайся получить доступ к parent DOM и не доверяй клиентским очкам.

UX И РЕЗУЛЬТАТ
- Mobile-first интерфейс для мыши, клавиатуры и touch; адаптация к iframe; заметные фокус-состояния и prefers-reduced-motion.
- Не добавляй внешние CDN-зависимости без необходимости. Не оставляй сетевые ссылки на localhost.
- В финале предоставь весь проект и проверочный список ZIP-структуры и SDK-сценариев.`,
      newPromptServer: `Ты — senior multiplayer game engineer. Создай серверную игру для SUPER CUBE Games Platform: браузерный клиент + авторитетный Node.js сервер.

ОБЯЗАТЕЛЬНЫЙ АРХИВ
- index.html и клиентские ресурсы в корне/подпапках; runtime.txt с единственной строкой server; server/index.js.
- В media/: title.txt (только английское название), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt и capsule.jpg/gif строго 630×500. Скриншоты — media/screenshots/.
- Сервер слушает Number(process.env.PORT || 3000) на 0.0.0.0. Клиентские ассеты используют относительные URL и работают через reverse proxy.

АРХИТЕКТУРА
- Раздели HTTP transport, валидацию payload, доменные игровые правила, управление комнатами и сериализацию состояния.
- Сервер авторитетен: он проверяет принадлежность комнаты, очередь хода, валидность действия, победу и итог счёта. Не принимай от клиента готовые очки/победителя.
- Для приватных комнат используй криптографически случайные токены; не публикуй закрытые комнаты и скрытые данные соперников.
- Реализуй heartbeat, таймаут disconnect, безопасное переподключение, выход, передачу владельца комнаты и очистку пустых комнат.
- Ограничь частоту/размер запросов, число комнат и потребление ресурсов. Продумай логи без секретов.
- Не подключайся напрямую к PostgreSQL или Data API. Для функций платформы используй window.SuperCubePlatform в клиенте.
- Опиши, какое игровое состояние временное, а какое должно переживать рестарт; не выдавай память процесса за долговечное хранилище.

СДАЧА
- Полный ZIP, краткая схема архитектуры, API-протокол и тест-кейсы для корректных/некорректных ходов, приватности, переподключения и смены хоста.`,
      convertPromptBrowser: `Ты — senior engineer, отвечающий за миграцию существующей HTML5-игры в SUPER CUBE Games Platform. Я передам тебе исходный ZIP. Сначала изучи его структуру и исходный код; не переписывай механику без необходимости.

ЗАДАЧА
1. Проверь стартовую страницу, ассеты, зависимости, размеры и пути ресурсов, хранение прогресса, сетевые вызовы и текущие build scripts.
2. Сохрани оригинальную механику/визуальный стиль, исправляя несовместимости и явные ошибки.
3. Сделай мобильный responsive UI и корректную работу в sandboxed iframe. Используй относительные URL, не обращайся к parent DOM или cookies.
4. Добавь корректную интеграцию window.SuperCubePlatform: getUser, loadSave/save, track для начала/завершения уровня, а share/rating/review/favorite — только где UI действительно это поддерживает. Все вызовы обрабатывай как Promise через try/catch.
5. Если оригинальная игра сохраняет прогресс локально, сохраняй гостевой режим, а для авторизованного игрока синхронизируй поддерживаемое состояние с cloud save без потери прогресса.

ФОРМАТ ПЛАТФОРМЫ
- В корне: index.html.
- В media/: title.txt (английское название), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt, capsule.jpg/gif строго 630×500, опционально screenshots/.
- Не удаляй лицензии/атрибуции и перечисли внешние зависимости.

ПРОВЕРКА И СДАЧА
- Верни полный обновлённый ZIP и список реально изменённых файлов.
- Проверь отсутствие сломанных путей, missing assets, console errors и ненужных внешних URL.
- Не заявляй о прохождении браузерного теста без фактического запуска. Отдельно перечисли ограничения или вопросы лицензирования.`,
      convertPromptServer: `Ты — senior multiplayer engineer. Адаптируй предоставленный ZIP существующей игры под server runtime SUPER CUBE, предварительно изучив код и сохранив игровой опыт.

ТРЕБОВАНИЯ АРХИВА
- index.html для клиента, runtime.txt со строкой server, server/index.js как точка входа.
- Метаданные находятся в media/: title.txt (только английское название), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt; capsule.jpg/gif ровно 630×500; скриншоты — media/screenshots/.

СЕРВЕРНАЯ АРХИТЕКТУРА
- Сервер слушает process.env.PORT || 3000 на 0.0.0.0; все клиентские URL относительные.
- Перенеси валидируемые правила, матчевое состояние, очередь ходов, результаты и авторизацию действий на сервер. Клиент отправляет только намерения и рисует безопасный state snapshot.
- Учитывай комнаты, случайные приглашения, приватные комнаты, выход/переподключение, таймауты и очистку пустых комнат.
- Защити маршруты rate limits и schema validation. Не доверяй client-sent player IDs, времени или результатам.
- Не обращайся к platform DB/Data API напрямую; player-facing функции используй через SDK.

СДАЧА
- Верни полный ZIP, перечень мигрированных компонентов, протокол запросов, инструкции локального запуска и тесты на очередность, некорректные ходы, повторные запросы, disconnect и приватность.
- Не утверждай, что игра протестирована на платформе, если проверен только автономный сервер.`
    },
    en: {
      browser: 'Simple browser games', server: 'Server games', browserTitle: 'When to use browser runtime',
      browserDesc: 'Use this mode for single-player and lightweight games whose logic can safely run in the browser. The platform hosts files in a sandboxed iframe and injects the SDK. Do not store trusted results, rewards or critical progress in the client.',
      serverTitle: 'When to use server runtime', serverDesc: 'Choose a server game when it needs authoritative multiplayer state, rooms, synchronization or server-validated moves. Each server game runs in its own container; its internal port 3000 does not conflict with the website port.',
      requirements: 'Archive format and requirements', reqBrowser: ['index.html at the archive root.', 'Place promotional files in media/. Required: media/title.txt with the English title, description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt and capsule.jpg or capsule.gif exactly 630 × 500.', 'Use relative URLs for game assets; never hardcode localhost.', 'Use window.SuperCubePlatform for saves, ratings, reviews, favourites and events.'],
      reqServer: ['Include runtime.txt containing server and server/index.js.', 'Listen on process.env.PORT || 3000 and bind to 0.0.0.0.', 'Use relative URLs for client assets so they work behind the runtime proxy.', 'Run game rules and move validation on the server; the client sends intents and renders state received from the server.', 'Do not connect directly to the platform PostgreSQL database or internal Data API.'],
      architecture: 'Recommended server-game architecture', arch: [
        'Separate transport from pure game logic: validate request schema → authorize session/room membership → apply state transition → return a safe state snapshot.',
        'The server decides active player, legal card/move, winner, rewards and match result. All client input is untrusted.',
        'Use random invite tokens for private rooms. Never include private rooms in public discovery or reveal opponents’ hidden cards.',
        'Define disconnect timeouts, reconnect behavior and host migration. Clean up inactive rooms on the server.',
        'Limit payload size, request rate, memory, CPU and room count. Never log invite tokens or secrets.',
        'Do not use container memory as the only durable save store. Matches may end after a restart; account data remains in the platform storage.'
      ],
      methodsTitle: 'SDK methods', methods: [
        ['getUser()', 'Current player', 'Returns authenticated, displayName and playerId. It does not expose email or internal administrator fields.'],
        ['save(data)', 'Cloud save', 'Stores JSON up to 250 KB for the authenticated player and current game.'],
        ['loadSave()', 'Load save', 'Returns save and updatedAt; save is null when no data exists. Guests may need to sign in.'],
        ['rate(1…5)', 'Rate the game', 'Creates or updates the current player’s rating for this game.'],
        ['review(text)', 'Review', 'Adds a review. Review points are computed by the server, never accepted from the client.'],
        ['favorite()', 'Favourites', 'Toggles the current game in the player’s favourites.'],
        ['share()', 'Share', 'Records a share event and returns the game URL. Call once per user action.'],
        ['recordClick(label)', 'Meaningful click', 'Records a small event, such as opening an inventory. Do not send personal data.'],
        ['track(name, metadata)', 'Progress events', 'Supported names are custom_click, level_start and level_complete. Metadata must be small and safe.']
      ],
      exampleTitle: 'Integration example', browserExampleTitle: 'Saving a browser game', serverExampleTitle: 'Minimal server-game entry point', showMethodExample:'Show code example', hideMethodExample:'Hide code example', clickerTitle:'Complete example: a simple clicker', clickerLead:'A self-contained browser game: score, load/save progress and graceful handling for guests.',
      promptsTitle: 'AI prompts', promptsLead: 'Choose a task. Copy the full prompt or download it as Markdown; provide the source ZIP when adapting an existing game.', promptTitle: 'SUPER CUBE Games',
      createPrompt: 'Create a new game', convertPrompt: 'Convert an existing ZIP', copyPrompt: 'Copy prompt', downloadPrompt: 'Download .md', copied: 'Prompt copied', downloaded: 'Prompt Markdown file downloaded', copyError: 'Automatic copy failed. Select the text and copy it manually.',
      promptQuality: `## Additional quality requirements
- Do not stop at a plan or code fragments: prepare a complete project with working files and assets.
- Deliver a complete game loop: clear start, feedback for actions, win/loss or round completion, and a way to play again.
- Check the interface on a narrow screen and inside an iframe; support mouse and touch, plus keyboard controls where appropriate.
- Provide readable contrast, visible keyboard focus, layouts without horizontal overflow, and respect prefers-reduced-motion.
- Avoid unnecessary external dependencies, secrets, test data, fake controls, and localhost links.
- Before delivery, inspect the file structure, relative paths, startup and console errors with available tools. In the final response list the archive contents, checks actually performed, and known limitations; never claim checks that were not run.`,
      promptServerQuality: `## Additional server-runtime requirements
- The client sends player intents only; the server validates every action and returns a safe state snapshot.
- Define message formats, errors, and protocol versioning. Reject malformed, oversized, or repeated requests safely.
- Never expose private data, invite tokens, opponents’ hidden information, or secrets in responses or logs.
- Provide local startup instructions and verification scenarios for two players, invalid moves, reconnects, and room cleanup.`,
      newPromptBrowser: `You are a senior HTML5 game developer. Build a complete responsive game for SUPER CUBE Games Platform.

FIRST
- Briefly describe the game loop, controls, states and win/loss conditions.
- Implement all controls end-to-end; do not leave TODOs or fake buttons.

ARCHIVE
- Include index.html and all necessary game assets at the ZIP root or in subfolders.
- Under media/, include title.txt (English title only), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt and capsule.jpg or capsule.gif exactly 630×500.
- Keep tags concise; tags.en.txt contains English tags. Store screenshots in media/screenshots/.
- Include all assets in the ZIP and use relative URLs for game resources.

SDK AND SECURITY
- Use window.SuperCubePlatform: getUser, save, loadSave, rate, review, favorite, share, recordClick and track.
- SDK methods are asynchronous. Use try/catch. Saves, ratings, reviews and favourites require authentication; show a clear sign-in path for guests.
- Do not call private platform APIs directly, read cookies, access parent DOM or trust client-provided scores.

UX AND DELIVERY
- Mobile-first mouse, keyboard and touch controls; iframe compatibility; visible focus states and prefers-reduced-motion support.
- Avoid unnecessary CDN dependencies and never hardcode localhost URLs.
- Deliver the full project and a validation checklist for ZIP structure and SDK scenarios.`,
      newPromptServer: `You are a senior multiplayer game engineer. Build a server-backed game for SUPER CUBE Games Platform: browser client + authoritative Node.js server.

REQUIRED ARCHIVE
- Include index.html and client assets, runtime.txt containing server, and server/index.js.
- Under media/: title.txt (English title only), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt and capsule.jpg/gif exactly 630×500. Screenshots belong in media/screenshots/.
- Listen on Number(process.env.PORT || 3000) and bind to 0.0.0.0. Client assets must use relative URLs and work behind a reverse proxy.

ARCHITECTURE
- Separate HTTP transport, payload validation, domain rules, room management and state serialization.
- The server is authoritative: validate room membership, turn order, legal moves, winner and final score. Never accept a final score/winner from the client.
- Use cryptographically random invite tokens for private rooms. Hide private rooms from public discovery and keep opponents’ hidden data private.
- Implement heartbeat, disconnect timeout, safe reconnect, leave, room host transfer and empty-room cleanup.
- Limit request rate/size, room count and resource usage. Ensure logs never contain secrets.
- Do not connect directly to PostgreSQL or the Data API. Use the client SDK for supported player-facing platform features.
- Document which state is ephemeral and what must survive restarts; do not present process memory as durable storage.

DELIVERY
- Provide the full ZIP, architecture outline, API protocol and test cases for valid/invalid moves, privacy, reconnection and host migration.`,
      convertPromptBrowser: `You are a senior engineer migrating an existing HTML5 game to SUPER CUBE Games Platform. I will provide the source ZIP. Inspect its structure and code before changing anything; do not rewrite game mechanics unless required.

TASKS
1. Inspect the entry page, assets, dependencies, paths, progress storage, network calls and build scripts.
2. Preserve the original gameplay and visual style while fixing incompatibilities and obvious defects.
3. Make the UI responsive and compatible with a sandboxed iframe. Use relative URLs; do not access parent DOM or cookies.
4. Integrate window.SuperCubePlatform: getUser, loadSave/save, track for level start/completion, and share/rating/review/favorite only when the UI genuinely supports them. Treat methods as Promises and use try/catch.
5. Keep a guest/local progress mode if the game already has one. For authenticated users, sync supported progress through cloud saves without losing existing data.

PLATFORM FORMAT
- Root: index.html.
- Under media/: title.txt (English title), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt, capsule.jpg/gif exactly 630×500, optionally screenshots/.
- Preserve licences/attribution and list external dependencies.

VALIDATION AND DELIVERY
- Return a full updated ZIP and list exactly which files changed.
- Check broken paths, missing assets, console errors and unnecessary external URLs.
- Do not claim a browser test passed unless you actually ran it. List remaining limitations and licence questions.`,
      convertPromptServer: `You are a senior multiplayer engineer adapting an existing game ZIP for SUPER CUBE server runtime. Inspect the game first and preserve the player experience.

ARCHIVE REQUIREMENTS
- Include client index.html, runtime.txt containing server and server/index.js.
- Metadata is under media/: title.txt (English title only), description.ru.txt, description.en.txt, tags.ru.txt, tags.en.txt; capsule.jpg/gif exactly 630×500; screenshots under media/screenshots/.

SERVER ARCHITECTURE
- Listen on process.env.PORT || 3000 bound to 0.0.0.0; use relative URLs for all client assets.
- Move validated rules, match state, turn order, results and action authorization to the server. The client sends intents and renders safe state snapshots.
- Support rooms, unguessable private invites, disconnect/reconnect, timeouts and empty-room cleanup.
- Protect endpoints with rate limits and schema validation. Never trust client-supplied player IDs, time or results.
- Do not connect directly to platform PostgreSQL/Data API; use the client SDK for supported player-facing features.

DELIVERY
- Return a full ZIP, list migrated components, provide request protocol and local run steps, and test turn order, invalid moves, retries, disconnects and privacy.
- Do not claim platform testing if only the standalone server has been tested.`
    }
  };
  let lang = window.SC?.language === 'en' ? 'en' : 'ru';
  let mode = 'browser';
  let promptMode = 'create';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getPrompt = () => {
    const d = text[lang];
    const body = promptMode === 'create'
      ? (mode === 'browser' ? d.newPromptBrowser : d.newPromptServer)
      : (mode === 'browser' ? d.convertPromptBrowser : d.convertPromptServer);
    const title = `${d.promptTitle} · ${promptMode === 'create' ? d.createPrompt : d.convertPrompt} · ${mode === 'browser' ? d.browser : d.server}`;
    const markdownBody = body.trim().replace(/^([А-ЯЁ][А-ЯЁ /&-]{2,}|[A-Z][A-Z /&-]{2,})$/gm, '## $1');
    return `# ${title}\n\n${markdownBody}\n\n${d.promptQuality}${mode === 'server' ? `\n\n${d.promptServerQuality}` : ''}\n`;
  };

  function methodCode(method, mode) {
    const snippets = {
      'getUser()': "const player = await window.SuperCubePlatform.getUser();\nif (!player.authenticated) {\n  // Keep guest play available; ask for sign-in only for cloud features.\n  console.info('Playing as guest');\n} else {\n  console.info('Player:', player.displayName, player.playerId);\n}",
      'save(data)': "try {\n  await window.SuperCubePlatform.save({ level: 3, score: 120 });\n} catch (error) {\n  console.warn('Cloud save unavailable', error);\n}",
      'loadSave()': "const result = await window.SuperCubePlatform.loadSave();\nif (result?.save) {\n  state = { ...state, ...result.save };\n}",
      'rate(1…5)': "// Call after the player explicitly chooses a rating.\nawait window.SuperCubePlatform.rate(5);",
      'rate(1..5)': "// Call after the player explicitly chooses a rating.\nawait window.SuperCubePlatform.rate(5);",
      'review(text)': "const text = 'A fun game with a clever mechanic.';\nawait window.SuperCubePlatform.review(text);",
      'favorite()': "const result = await window.SuperCubePlatform.favorite();\nconsole.log('Now favourited:', result.favorite);",
      'share()': "const result = await window.SuperCubePlatform.share();\nif (navigator.share) await navigator.share({ title: 'My game', url: result.url });\nelse await navigator.clipboard.writeText(result.url);",
      'recordClick(label)': "await window.SuperCubePlatform.recordClick('open inventory');",
      'track(name, metadata)': "await window.SuperCubePlatform.track('level_start', { label: 'level-1' });\n// Later, after success:\nawait window.SuperCubePlatform.track('level_complete', { label: 'level-1' });"
    };
    if (method.toLowerCase().includes('server')) return mode === 'server' ? examples.server : '// Server-side operations do not run from the browser SDK.\n// Keep authoritative room state and move validation in server/index.js.';
    return snippets[method] || snippets[method.replace('1…5','1..5')] || `// Example usage\nawait window.SuperCubePlatform.${method.replace(/\(.*/, '')}();`;
  }
  function fullClickerExample() {
    return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SC Clicker</title>
<style>body{font:16px system-ui;max-width:520px;margin:12vh auto;padding:24px;text-align:center;background:#f4f4f0;color:#111}button{font:inherit;padding:14px 24px;border:0;background:#a8f0bd;cursor:pointer}#count{font-size:64px;font-weight:800;margin:24px}small{display:block;margin:14px;color:#666}</style>
<main><h1>Simple Clicker</h1><div id="count">0</div><button id="click">+1 point</button><button id="save">Save</button><small id="status">Loading…</small></main>
<script>
const api=window.SuperCubePlatform;let count=0;const countNode=document.querySelector('#count');const statusNode=document.querySelector('#status');function render(){countNode.textContent=String(count)}
async function start(){try{const user=await api.getUser();if(user.authenticated){const saved=await api.loadSave();count=Math.max(0,Number(saved?.save?.count||0));statusNode.textContent='Cloud save enabled';}else statusNode.textContent='Guest mode — sign in to sync progress';}catch(e){statusNode.textContent='Playing offline';}render()}
document.querySelector('#click').addEventListener('click',async()=>{count++;render();try{await api.track('custom_click',{label:'click'});}catch{} });document.querySelector('#save').addEventListener('click',async()=>{try{const user=await api.getUser();if(!user.authenticated){statusNode.textContent='Sign in to save progress';return;}await api.save({count});statusNode.textContent='Progress saved';}catch(e){statusNode.textContent='Could not save progress';}});start();
</script></html>`;
  }
  function render() {
    const d = text[lang];
    const requirements = mode === 'browser' ? d.reqBrowser : d.reqServer;
    const exampleTitle = mode === 'browser' ? d.browserExampleTitle : d.serverExampleTitle;
    root.innerHTML = `
      <div class="sdk-mode-tabs" role="tablist" aria-label="${esc(lang==='ru'?'Тип игры':'Game type')}">
        <button type="button" class="button ${mode==='browser'?'':'secondary'} sdk-mode-tab" data-mode="browser" role="tab" aria-selected="${mode==='browser'}">${esc(d.browser)}</button>
        <button type="button" class="button ${mode==='server'?'':'secondary'} sdk-mode-tab" data-mode="server" role="tab" aria-selected="${mode==='server'}">${esc(d.server)}</button>
      </div>
      <section class="sdk-info-panel"><h3>${esc(mode==='browser'?d.browserTitle:d.serverTitle)}</h3><p>${esc(mode==='browser'?d.browserDesc:d.serverDesc)}</p></section>
      <div class="sdk-two-column">
        <section><h3>${esc(d.requirements)}</h3><ul>${requirements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
        ${mode==='server'?`<section><h3>${esc(d.architecture)}</h3><ol>${d.arch.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>`:`<section><h3>${esc(lang==='ru'?'Быстрый старт':'Quick start')}</h3><p>${esc(lang==='ru'?'Загрузи сохранение при старте и сохраняй его после успешного изменения прогресса. Гость может играть без облачного сохранения.':'Load progress on startup and save after a successful state change. Guests can play without cloud saves.')}</p></section>`}
      </div>
      <section class="sdk-api-methods"><h3>${esc(d.methodsTitle)}</h3>${d.methods.map(m=>{const code=methodCode(m[0],mode);return `<details class="sdk-api-method"><summary><code>${esc(m[0])}</code><strong>${esc(m[1])}</strong><span>${esc(d.showMethodExample)}</span></summary><p>${esc(m[2])}</p><pre><code>${esc(code)}</code></pre></details>`;}).join('')}</section>
      <section class="sdk-code-example"><h3>${esc(d.exampleTitle)} · ${esc(exampleTitle)}</h3><pre><code>${esc(examples[mode])}</code></pre></section>
      <section class="sdk-code-example sdk-full-clicker"><h3>${esc(d.clickerTitle)}</h3><p>${esc(d.clickerLead)}</p><details><summary>${esc(d.showMethodExample)}</summary><pre><code>${esc(fullClickerExample())}</code></pre></details></section>
      <section class="sdk-prompts"><h3>${esc(d.promptsTitle)}</h3><p>${esc(d.promptsLead)}</p>
        <div class="sdk-mode-tabs prompt-tabs" role="group"><button type="button" class="button ${promptMode==='create'?'':'secondary'}" data-prompt="create">${esc(d.createPrompt)}</button><button type="button" class="button ${promptMode==='convert'?'':'secondary'}" data-prompt="convert">${esc(d.convertPrompt)}</button></div>
        <div class="sdk-prompt-header"><strong>${esc(promptMode==='create'?d.createPrompt:d.convertPrompt)} · ${esc(mode==='browser'?d.browser:d.server)}</strong><div class="sdk-prompt-actions"><button class="button secondary" type="button" id="downloadSdkPrompt">${esc(d.downloadPrompt)}</button><button class="button sdk-copy-button" type="button" id="copySdkPrompt">${esc(d.copyPrompt)}</button></div></div>
        <pre class="sdk-prompt-text" id="sdkPromptText"><code>${esc(getPrompt())}</code></pre><p class="small muted" id="sdkCopyStatus" role="status"></p>
      </section>`;
    const sections = [...root.querySelectorAll(':scope > section, :scope > .sdk-two-column')];
    const ids = ['sdk-overview','sdk-requirements','sdk-methods','sdk-example','sdk-clicker','sdk-prompts'];
    sections.forEach((section, i) => { if (!section.id) section.id = ids[i] || `sdk-section-${i}`; });
    const side = document.getElementById('sdkSideLinks');
    if (side) side.innerHTML = sections.map((section, i) => `<a href="#${section.id}">${esc(section.querySelector('h3')?.textContent || (lang==='ru'?'Раздел':'Section'))}</a>`).join('');
    root.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));
    root.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{promptMode=b.dataset.prompt;render()}));
    root.querySelector('#copySdkPrompt').addEventListener('click',copyPrompt);
    root.querySelector('#downloadSdkPrompt').addEventListener('click',downloadPrompt);
  }
  async function copyPrompt() {
    const button = root.querySelector('#copySdkPrompt');
    const status = root.querySelector('#sdkCopyStatus');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(getPrompt());
      else { const area=document.createElement('textarea'); area.value=getPrompt(); area.style.position='fixed'; area.style.opacity='0'; document.body.appendChild(area); area.select(); const ok=document.execCommand('copy'); area.remove(); if(!ok) throw new Error('copy failed'); }
      status.textContent=text[lang].copied;
    } catch { status.textContent=text[lang].copyError; }
    button.blur();
  }
  function downloadPrompt() {
    const d = text[lang];
    const kind = promptMode === 'create' ? 'create' : 'adapt';
    const locale = lang === 'ru' ? 'ru' : 'en';
    const fileName = `super-cube-${kind}-${mode}-${locale}.md`;
    const file = new Blob(['\uFEFF', getPrompt()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const status = root.querySelector('#sdkCopyStatus');
    if (status) status.textContent = d.downloaded;
  }
  function updatePageLanguage(nextLang) {
    lang = nextLang === 'en' ? 'en' : 'ru';
    document.title = lang === 'en' ? 'Developer SDK — SUPER CUBE Games' : 'SDK для разработчиков — SUPER CUBE Games';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = lang === 'en'
      ? 'SUPER CUBE Games SDK guide for browser and server games, with method descriptions and integration examples.'
      : 'Руководство SDK SUPER CUBE Games для браузерных и серверных игр, описание методов и примеры интеграции.';
    render();
  }
  window.addEventListener('sc:language', (event) => updatePageLanguage(event.detail?.lang));
  updatePageLanguage(document.documentElement.lang);
})();
