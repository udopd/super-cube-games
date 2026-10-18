# SUPER CUBE Games Platform — серверный MVP

Самостоятельный проект платформы для публикации браузерных игр в стиле SUPER CUBE. Это серверное приложение, а не только статический макет: у него есть каталог, аккаунты игроков, кабинет администратора, ZIP-загрузчик, приватные тестовые сборки, публикация, игровые оценки и отзывы, избранное, облачные сохранения и аналитика.

> **Архитектура:** Platform API (Express) не подключается к PostgreSQL напрямую. Все SQL-операции проходят через отдельный закрытый Data API по списку заранее зарегистрированных запросов. Data API — единственный компонент с драйвером PostgreSQL.
>
> **Статус проверки:** синтаксис и контракт Data API проверяются локальными тестами. Полный запуск с PostgreSQL/Docker нужно выполнить в окружении с Docker Engine; в среде разработки не установлен Docker, а доступность npm registry ограничена. SMTP требует собственных реквизитов и исходящего сетевого доступа.

## Что внутри

- Публичный каталог с фильтрами по тегам, минимальному рейтингу, типу количества игроков и сортировкой по новизне/рейтингу/игрокам/запускам.
- Один администратор с логином и паролем из `ADMIN_LOGIN` и `ADMIN_PASSWORD`; email для административной роли задаётся через `ADMIN_EMAIL`.
- Вход и регистрация по email-коду.
- Загрузка ZIP через drag-and-drop или выбор файла, проверка структуры, безопасное извлечение, чтение метаданных и капсулы.
- Приватный тестовый адрес `/games/<slug>-test`, доступный администратору. После проверки игру можно отредактировать и опубликовать на `/games/<slug>`.
- Кабинет игрока: все игры, недавние пять, избранное и топ-3 игр по суммарному времени.
- Кабинет администратора: игроки, запуски, средний рейтинг и число оценок, медианное время сессии, отзывы, игровые клики, клики из каталога, внешние переходы и количество добавлений в избранное.
- SDK `window.SuperCubePlatform` для событий, оценок, отзывов, избранного и облачных сохранений.
- PostgreSQL для пользователей, игр, сессий, событий, отзывов, оценок, избранного, сохранений, email OTP и метрик; отдельный внутренний Data API; файловое хранилище в постоянном volume.
- SEO: уникальные title/description, canonical и Open Graph у игровых страниц, JSON-LD `VideoGame`, sitemap, robots, favicon и описание каталога.
- Базовые HTTP security headers, CSRF-токен, проверка Origin для запросов записи, rate limiting и безопасное извлечение ZIP с проверками путей/размера.

## Требования

- Node.js 20+ и npm для запуска вне контейнеров
- PostgreSQL 16+ (при локальном запуске без Docker)
- Docker Engine + Docker Compose (рекомендуемый способ запуска)
- Постоянные volume для PostgreSQL и `storage/`
- Для production: HTTPS и reverse proxy/CDN/WAF

## Запуск локально (рекомендуется через Docker Compose)

1. Установи Docker Desktop / Docker Engine с Compose Plugin.
2. В корне проекта выполни:

```bash
cp .env.example .env
```

3. В `.env` задай уникальные случайные значения для `SESSION_SECRET`, `OTP_PEPPER`, `DATA_API_TOKEN` и `SERVER_GAME_RUNTIME_TOKEN` (оба межсервисных токена — не короче 32 символов). Задай надёжный `POSTGRES_PASSWORD`, удобнее использовать буквы/цифры/дефис, чтобы не кодировать символы в URI.
4. Запусти стек:

```bash
docker compose up --build
```

### Server-game runtime (Docker Desktop / Linux)

Compose включает четыре сервиса: `postgres`, `data-api`, `game-runtime` и `platform`. `game-runtime` — отдельный доверенный контроллер с Docker CLI и доступом к Docker Engine socket. Platform API сам сокет не получает. На Docker Desktop выбери Linux containers и убедись, что Engine запущен. Если runtime manager unhealthy, выполни `docker compose logs --tail=100 game-runtime` и `docker compose exec game-runtime docker info`. Не публикуй порт 4100 и не включай неаутентифицированный TCP API Docker Engine.

`SERVER_GAME_RUNTIME_TOKEN` должен быть случайным уникальным секретом не короче 32 символов. В `.env` он задаётся один раз и передаётся обоим сервисам. Runtime manager определяет volume `platform-storage`, который монтируется в контейнер. Если несколько Compose-проектов создали одноимённые volume, задай `PLATFORM_STORAGE_VOLUME_NAME` равным точному имени нужного Docker volume.

Compose запускает четыре сервиса и собирает отдельные образы для Platform API, Data API и game-runtime: контейнер Platform API не устанавливает драйвер `pg` и не получает `DATABASE_URL`/пароль PostgreSQL; контейнер Data API содержит `pg` и получает единственный набор реквизитов подключения к базе:

- `platform` — публичный Express API и сайт, порт `3000`;
- `data-api` — внутренний Data API, порт `4001`, не публикуется на хост;
- `postgres` — PostgreSQL 16 с постоянным volume. Порт БД доступен только через `127.0.0.1` для локальных инструментов миграции;
- `game-runtime` — внутренний менеджер запуска игр, единственный сервис с Docker socket.

Data API применяет `data-service/schema.sql` при старте и проверяет соединение. Platform API ждёт, пока `/health` Data API подтвердит готовность. Остановка и повторный запуск Compose сохраняют базу и файлы в named volumes.

Открой `http://localhost:3000/`. Диагностика: `http://localhost:3000/health` и (из внутренней docker-сети) `http://data-api:4001/health`.

### Локальный запуск процессов без Docker Compose

Если PostgreSQL уже установлен и доступен на `127.0.0.1:5432`, после копирования и настройки `.env` выполни `npm install`, затем в первом терминале `npm run start:data`, во втором — `npm start`. `DATABASE_URL` в этом режиме должен ссылаться на PostgreSQL через `127.0.0.1`, а `DATA_API_URL` — на `http://127.0.0.1:4001`.

Платформа намеренно не запускается, если Data API не проходит health-check. Это не позволяет сервису молча работать в частично доступном состоянии.

### Основные переменные окружения

- `DATA_API_URL` — адрес Data API, доступный Platform API.
- `DATA_API_TOKEN` — общий секрет для аутентификации межсервисных запросов, хранится только в окружении сервисов.
- `DATA_API_PORT` — внутренний порт Data API (по умолчанию `4001`).
- `DATABASE_URL` — строка подключения PostgreSQL (известна только Data API и миграционному скрипту).
- `DATABASE_SSL=1` — включает TLS подключения к PostgreSQL; используйте соответствующий сертификат/параметры среды.
- `DATA_API_POOL_MAX` — максимум одновременных PostgreSQL-подключений в пуле.

Не публикуй `DATA_API_TOKEN` или `DATABASE_URL`, не помещай их в клиентский JS и не коммить `.env`.

## Архитектура Platform API / Data API / PostgreSQL

```text
Браузер / игровой SDK
        │ HTTPS + сессия + CSRF
        ▼
Platform API (Express :3000)
  бизнес-правила, права доступа,
  начисление очков, игровые сценарии
        │ Bearer DATA_API_TOKEN
        ▼
Data API (Express :4001, private)
  allowlist заранее зарегистрированных SQL-запросов
        │ node-postgres Pool
        ▼
PostgreSQL 16
  пользователи, игры, сессии, события,
  сохранения, отзывы, очки и снимки метрик
```

Platform API не имеет PostgreSQL-драйвера и не принимает параметры подключения к СУБД. Клиент Data API отправляет **ID запроса SHA-256, режим (`get`/`all`/`run`) и параметры**. Сырой SQL по HTTP не передаётся: Data API разрешает только запросы из `data-service/query-catalog.json`, созданного из проверенных статических SQL-вызовов скриптом `npm run build:data-catalog`. Параметризованные значения и точное число параметров проверяются на сервере. Пакетные операции доступны через `/internal/v1/batch` и выполняются одной PostgreSQL-транзакцией.

Внутренний Data API не публикуется наружу в Compose. Bearer-токен обязателен для всех `/internal/v1/*` маршрутов; для production дополнительно закрывайте сервис сетевой политикой/приватной сетью и выдавайте секреты через secret manager. Это внутренний шлюз SQL по allowlist, а не универсальный REST-прокси к произвольным таблицам.

### Репозитории и ответственность

`src/db.js` экспортирует клиент Data API из `shared/data-client.js`. Бизнес-логика маршрутов, авторизации, игр и аналитики работает через совместимый интерфейс `prepare(...).get/all/run` и транзакционные `.batch(...)`, но не импортирует `pg`. Все SQL-операторы собраны в реестре с SHA-256 идентификаторами; когда добавляешь или меняешь SQL-строку, пересобери реестр и проверь diff:

```bash
npm run build:data-catalog
npm test
```

Начальная схема PostgreSQL находится в `data-service/schema.sql` и применяется как миграция `001_initial` с сохранённым checksum. Не редактируй уже применённую миграцию: для изменений добавляй `data-service/migrations/002_*.sql`, `003_*.sql` и т. д. Data API применяет их по порядку и откажется стартовать, если checksum существующей миграции изменился.

### Перенос существующей SQLite-базы

Переход не переносит существующие данные автоматически. Перед миграцией сделай резервную копию старой базы `storage/platform.sqlite` и останови запись старой версии:

```bash
python scripts/export-sqlite.py storage/platform.sqlite migration-export.json
```

Запусти PostgreSQL и Data API, затем импортируй JSON напрямую в PostgreSQL (для этого `DATABASE_URL` должен быть адресован на `127.0.0.1`, порт которого Compose открывает только на localhost):

```bash
node scripts/import-sqlite-export.mjs migration-export.json
```

Скрипт переносит поддерживаемые таблицы пользователей, идентичностей, игр, игровых сессий, событий, оценок, комментариев, избранного, сохранений, email-кодов и метрик. Совпадающие записи пропускаются; последовательности ID синхронизируются. Сессии входа намеренно не мигрируют — игрокам, скорее всего, потребуется войти заново. Экспорт содержит персональные данные: держи JSON вне публичного каталога, не включай его в архив/репозиторий и безопасно удали после проверки. Сравни количество записей и контрольные метрики до переключения пользователей.

### Ограничения текущего этапа

- Данные приложения и сессии уже сохраняются в PostgreSQL через Data API. Файлы игр и аватары по-прежнему хранятся в постоянном `platform-storage` volume; адаптер объектного хранилища (S3/GCS) — отдельный следующий этап. Не удаляй volume при обновлении.
- Серверные игры запускает отдельный внутренний `game-runtime` service. Только его контейнер содержит Docker CLI и подключён к Docker Engine socket; публичный Platform API обращается к нему через внутренний HTTP API с `SERVER_GAME_RUNTIME_TOKEN`. Не монтируй Docker socket в `platform`: доступ к Docker Engine фактически позволяет управлять контейнерами хоста.
- Доступность Data API уменьшает прямую связанность с СУБД, но добавляет сетевой hop и новую точку отказа. Настрой health checks, timeouts, резервное копирование PostgreSQL и контроль размера пула.

## Вход и почта

Задай `ADMIN_LOGIN`, `ADMIN_PASSWORD` (не короче 12 символов) и `ADMIN_EMAIL` в `.env`. При первом входе с этими логином и паролем приложение создаст или подтвердит административную учётную запись с адресом `ADMIN_EMAIL`.

Для входа и регистрации игроков заполни `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Для Gmail используй порт `587` с STARTTLS (`SMTP_SECURE=false`) и пароль приложения. SMTP-провайдер и хост должны разрешать исходящие подключения на выбранный порт. Код состоит из шести цифр, действует 10 минут и блокируется после пяти неверных попыток. Хранится hash кода, а не сам код.

## Формат ZIP-архива игры

Новый рекомендуемый формат (название остаётся только на английском; пользовательские описания и теги локализуются отдельно):

```text
my-game.zip
├── index.html
├── runtime.txt                # optional: browser (default) или server
├── media/
│   ├── title.txt              # английское название, 1–120 символов
│   ├── description.ru.txt     # русское описание, до 1600 символов
│   ├── description.en.txt     # английское описание, до 1600 символов
│   ├── tags.ru.txt            # русские теги через запятую
│   ├── tags.en.txt            # английские теги через запятую (видны в каталоге)
│   ├── capsule.jpg            # JPG/GIF ровно 630 × 500 px
│   ├── promo.png              # другие промоматериалы
│   └── screenshots/           # изображения галереи попапа
│       ├── 01.jpg
│       └── 02.webp
└── server/                    # обязательно для runtime=server
    └── index.js
```

Все пять metadata-файлов должны находиться именно в `media/`. Все текстовые файлы — UTF-8. Для совместимости архивов, загруженных до обновления, backend продолжает читать старые metadata-файлы, но новые архивы следует собирать только в указанном выше формате. Файлы `media/screenshots/` автоматически попадают в попап игры; изображения прямо в `media/` считаются промоматериалами. Капсула может называться иначе, но должна быть корректным JPEG/JPG либо GIF ровно 630 × 500.

Размер архива ограничен 100 MB, распакованные данные — 250 MB, файлов — 2000; проверяются абсолютные пути, traversal (`..`), симлинки и чрезмерное сжатие. Админ-интерфейс показывает точный размер исходного ZIP в байтах и дополнительно KB/MB. Игры `browser` выполняются в sandboxed iframe, а `server` — только в отдельном Docker runtime (см. ниже).

Проверочные примеры: `examples/pocket-clicker.zip` (browser) и `examples/durak-online.zip` (server, простая многопользовательская игра «Дурак» на 2–6 игроков). В серверном примере комнаты хранятся в памяти процесса и сбрасываются при перезапуске контейнера. Docker требуется для реального запуска server runtime; без установленного Docker игра вернёт понятную ошибку runtime.

## Server runtime и изоляция

Для серверной игры добавь `runtime.txt` со значением `server` и `server/index.js`. Файлы в изолированную копию нормализуются по чтению (`chmod -R a+rX`), так как контейнер запускается от UID `10001`, а ZIP-распаковка сохраняет более строгие права `0640` для файлов приложения. При сбое запуска runtime manager собирает логи контейнера перед очисткой. Точка входа должна слушать `0.0.0.0:3000`. Platform API не запускает Docker CLI напрямую: он вызывает выделенный внутренний `game-runtime` service на `http://game-runtime:4100` с отдельным `SERVER_GAME_RUNTIME_TOKEN`. В Compose только `game-runtime` монтирует `/var/run/docker.sock` и содержит Docker CLI; этот API не публикуется на host port. Из-за привилегий Docker socket runtime manager должен оставаться доверенным внутренним сервисом, его токен — секретом, а endpoint — недоступным извне. Каждый экземпляр игры запускается без внешней сети, с непривилегированным UID, read-only файловой системой и только собственной копией файлов, dropped capabilities, `no-new-privileges`, ограничениями CPU/RAM/PID и временным `/tmp`. Для запуска нужен Docker Engine и локально доступный образ `node:22-alpine` (или `SERVER_GAME_DOCKER_IMAGE`). Серверные игры должны комплектоваться зависимостями в архиве; `npm install` во время runtime недоступен из-за отключённой внешней сети контейнера. Все игры слушают внутренний `0.0.0.0:3000`; внешние запросы проходят через Platform API и внутренний runtime manager, поэтому порт сайта не конфликтует с портом игры. Опубликованные server-игры автоматически прогреваются при старте приложения, лениво стартуют при первом запросе и останавливаются при снятии с публикации или удалении. `/api/games/:slug/ping` возвращает состояние и время ответа.

Контейнерная конфигурация повышает изоляцию, но не заменяет полноценный security review, отдельный host/VM для недоверенного кода и антивирусную проверку архивов. Включай серверный режим только для игр, которым действительно нужен свой серверный процесс.

## Публикация игры

1. Войди паролем администратора из `ADMIN_LOGIN` и `ADMIN_PASSWORD`.
2. Открой `/admin.html`, загрузи ZIP.
3. Backend проверит архив, создаст запись `draft`, распакует файлы в `storage/games/<slug>/` и покажет тестовый URL `/games/<slug>-test`.
4. Отредактируй метаданные/теги/количество игроков или загрузи новую капсулу 630 × 500.
5. Проверь игру в закрытом тестовом режиме.
6. Нажми **Publish**. Игра появится в каталоге и станет доступна по `/games/<slug>`.

Slug генерируется при загрузке из названия (нижний регистр, слова через дефис; кириллица транслитерируется в латиницу) и после редактирования отображаемого названия остаётся стабильным, чтобы не ломать ссылки.

## SDK игры

Платформа автоматически добавляет `public/js/game-sdk.js` к HTML-страницам игры. Код запускается внутри sandboxed iframe без `allow-same-origin`; запросы к платформе проходят через `postMessage` bridge в host-странице. Не обращайся к приватным API напрямую из игры.

```js
const player = await window.SuperCubePlatform.getUser();

// Cloud save: требует авторизации игрока
await window.SuperCubePlatform.save({ level: 3, coins: 120 });
const saved = await window.SuperCubePlatform.loadSave();

// Rating / review: требуют авторизации
await window.SuperCubePlatform.rate(5);
await window.SuperCubePlatform.review('A lovely little puzzle.');

// Favourite toggle: requires a player account
await window.SuperCubePlatform.favorite();

// Share metric + URL for an explicit user action
const { url } = await window.SuperCubePlatform.share();

// Analytics events
await window.SuperCubePlatform.recordClick('open inventory');
await window.SuperCubePlatform.track('level_start', { label: 'level 2' });
await window.SuperCubePlatform.track('level_complete', { label: 'level 2' });
```

Методы SDK: `getUser`, `save`, `loadSave`, `rate`, `review`, `favorite`, `share`, `recordClick`, `track`. События, доступные в `track`: `custom_click`, `level_start`, `level_complete`. Пользователь должен быть авторизован для сохранений, оценок, отзывов и избранного. Анонимная игра учитывается по `scgames-guest-id` в браузере; очистка локального хранилища может создать новый анонимный ID.

## API маршруты

- `GET /api/bootstrap` — CSRF token, состояние аккаунта и доступность email-входа.
- `GET /api/games` — каталог с фильтрами `tag`, `minRating`, `players` (`any`, `solo`, `multi`) и `sort` (`newest`, `rating`, `players`, `plays`).
- `POST /api/auth/email/start`, `POST /api/auth/email/verify`, `POST /api/auth/logout` — email-код и выход.
- `GET /api/me/summary` — история игр, недавние игры, избранное и топ-3. `PATCH /api/me/profile`, `POST /api/me/avatar`, `POST /api/me/password` — настройки игрока; сохраняется только уменьшенная аватарка 64×64.
- `GET|POST /api/games/:slug/save`, `POST /api/games/:slug/rating`, `/review`, `/favorite`, `/share`, `GET /api/games/:slug/ping` — игровые функции, метрика поделиться и ping серверного runtime. Review API также поддерживает `PATCH /reviews/:reviewId`, `DELETE /reviews/:reviewId` и `POST /reviews/:reviewId/reply` для ответов администратора.
- `POST /api/sdk/session/start|heartbeat|end`, `POST /api/sdk/event` — статистика SDK.
- `GET /api/admin/summary`, `GET /api/admin/metrics`, `GET /api/admin/leaderboard`, `GET /api/admin/players/:id`, `POST /api/admin/players/:id/email`, `GET /api/admin/games`, `POST /api/admin/games/upload`, `PATCH /api/admin/games/:slug`, `POST /api/admin/games/:slug/capsule`, `POST /api/admin/games/:slug/publish|unpublish`, `DELETE /api/admin/games/:slug` — функции администратора.
- `GET /sitemap.xml`, `GET /robots.txt` — SEO.

Все mutating API-запросы требуют CSRF-заголовок `x-csrf-token`, полученный через `/api/bootstrap`. Admin API проверяет права на сервере — скрытие кнопки в интерфейсе не является контролем доступа.

## Страницы продукта и очки игроков

- `/hero.html` — отдельный hero без прокрутки с CTA в каталог; язык и тема сохраняются между страницами.
- `/documentation.html` — полная проектная документация со ссылками на SDK в содержании, разделе инструментов и футере; `/sdk.html` — отдельная страница SDK с переключением RU/EN.
- `/leaderboard.html` — публичный рейтинг с ID, никнеймом и очками; `/admin/metrics` — защищённый глобальный дашборд и подробный профиль игрока с возможностью отправить шаблонное письмо.
- Кабинет игрока (`/profile.html`) содержит историю, избранное, загрузку аватара произвольного размера с автоматической обрезкой до квадрата (в серверном хранилище остаётся миниатюра 64 × 64), смену никнейма и настройку пароля. Администратор перенаправляется в административную панель и не использует кабинет игрока.
- Очки вычисляются сервером: минуты активного времени, баллы за самый длинный отзыв на игру, однократное добавление игры в избранное, однократный share по игре и бонус за суммарные часы. Публичная таблица не показывает email.
- Счётчик времени принимает короткие heartbeat только для видимой и сфокусированной вкладки, ограничивает максимальный интервал и хранится на сервере. Это повышает качество метрик, но браузерное окружение всё ещё можно автоматизировать; для высокой ценности рейтинга нужны антибот-защита, аудит аномалий и ограничения аккаунтов.

## Исторические метрики и локализация

- Отдельный dashboard доступен только администратору на `/admin/metrics`. В нём отображаются суммарные показатели, сравнения игр, текущий CCU, почасовая история CCU платформы/игр и история дневных игроков. Числовые KPI анимируются от нуля при первой отрисовке.
- Снимок метрик сохраняется каждую минуту, дневная серия строится из серверных снимков и событий/сессий. История начинается с момента установки этой версии; старые значения задним числом восстановить невозможно. «Текущий CCU» — оценка по heartbeat активных сессий и может отличаться от аналитики внешних систем.
- `documentation.html` и `sdk.html` намеренно исключены из автоматической локализации; остальные страницы используют RU/EN из общего хранилища языка. Анимация scramble удалена.
- Аватар в комментариях отображается как миниатюра. Для него клиент принимает исходник строго 512 × 512, преобразует в WebP 64 × 64, а сервер валидирует размер производного изображения перед сохранением.

## Защита и production заметки

- Есть лимит запросов на API/auth, отдельный лимит загрузок, security headers, CSRF, Origin check, ограничения размера запросов и ZIP-архивов, cookie `HttpOnly`, `SameSite=Lax` и `Secure` в production.
- Это **не полноценная DDoS-защита**: rate limiting приложения помогает с частыми запросами, но не фильтрует сетевой объём атаки. Перед публикацией ставь платформу за CDN/WAF (например, сервисом edge-защиты), включай защиту L3/L4 у хостинга и ограничивай запросы на reverse proxy. Устанавливай `TRUST_PROXY=1` только если приложение действительно расположено за известным доверенным proxy, иначе IP rate limiter можно обойти поддельными заголовками.
- Для production обязательны HTTPS, реальные secrets, резервные копии `storage/`, SMTP и ключи провайдеров.
- PostgreSQL и Data API вынесены в отдельные сервисы. Для масштабирования нескольких Platform API-инстансов нужно вынести файлы в S3/GCS, серверный игровой runtime — в отдельный ограниченный менеджер, а также настроить миграции схемы, мониторинг и резервные копии.
- До широкого публичного запуска рекомендуются: антивирусная проверка ZIP, модерация пользовательских игр/отзывов, лимиты диска, политика конфиденциальности/хранения данных, условия использования, мониторинг, резервное копирование и отдельный origin для пользовательского игрового контента.

## Структура проекта

```text
super-cube-platform/
├── server.js
├── package.json
├── .env.example
├── README.md
├── PROJECT_DESCRIPTION.md
├── HANDOFF.md
├── HANDOFF_SUMMARY.txt
├── src/
│   ├── auth.js
│   ├── db.js
│   ├── security.js
│   ├── games.js
│   ├── analytics.js
│   └── server-game-runtime.js
├── public/
│   ├── index.html
│   ├── hero.html
│   ├── documentation.html
│   ├── sdk.html
│   ├── leaderboard.html
│   ├── login.html
│   ├── profile.html
│   ├── admin.html
│   ├── 404.html
│   ├── css/
│   └── js/
├── private-pages/            # admin-only metrics and recommendations
├── examples/
│   ├── pocket-clicker/ + pocket-clicker.zip
│   └── durak-online/ + durak-online.zip
├── scripts/smoke-test.mjs
├── data-service/             # private PostgreSQL Data API, schema and query allowlist
├── shared/                   # Platform API client + PostgreSQL-backed session store
├── scripts/                  # query registry builder, SQLite export/import and smoke tests
├── docker-compose.yml
├── Dockerfile                 # Platform API image (without pg driver)
├── Dockerfile.data-api        # minimal Data API image (with pg driver)
└── storage/                  # uploaded game files and avatars in persistent volume; not distributed
```


### Email-code sign-in, registration and reset

The login page has separate **Sign in** and **Create account** modes. Existing accounts should use Sign in; the registration flow only creates an account after verifying the email code. If a code expired, was typed incorrectly too many times, or was sent for the wrong mode, use **Send a new code**. This overwrites the previous active challenge for the email and resets its attempt counter; it does not reset or delete the account. Codes are bound to the flow that requested them, so switching between Sign in and Create account requires a fresh code.

If the UI or logs still show `duplicate key value violates unique constraint "identities_provider_provider_subject_key"`, the running Docker image may contain an older email-identity insert. The current code uses `ON CONFLICT(provider, provider_subject) DO NOTHING`, then checks that the identity belongs to the same user. Rebuild **both** application images so the Platform API and its SQL allowlist are in sync:

```powershell
docker compose build --no-cache platform data-api
docker compose up -d --force-recreate platform data-api
docker compose logs --tail=100 platform data-api
```

This does not remove data. Preserve `.env` and the `postgres-data` volume. Do not delete identities or drop the UNIQUE constraint to fix sign-in.


### Stable game identity and cloud saves

Game save endpoints are keyed by the canonical platform slug (`/games/<slug>`), which resolves to the game's stable database ID. URL parameters such as `?src=catalog` are attribution metadata only: the game host records the source, removes `src` from the visible URL with `history.replaceState`, and uses the pathname/server-injected slug for SDK calls. Therefore a catalog click and a direct open address the same cloud-save record.


### Server-game proxy troubleshooting

If a server game HTML page loads but in-game POST actions fail with `socket hang up`, the platform JSON middleware may already have consumed the incoming request stream. The current implementation preserves the raw parsed bytes and replays them to the runtime proxy with a corrected `Content-Length`. The runtime manager also logs every handled request and logs Node HTTP parser `clientError` events; these are important because malformed/incomplete HTTP messages can be rejected with HTTP 400 before the application handler runs.

After updating, rebuild both services (no data volumes need to be removed):

```powershell
docker compose build --no-cache platform game-runtime
docker compose up -d --force-recreate platform game-runtime
docker compose logs --since=5m --timestamps platform game-runtime
```

Expected runtime logs include requests such as `POST /v1/games/durak-online/start -> 200` and `POST /v1/games/durak-online/proxy/api/rooms -> 200`. If HTTP 400 recurs, look for `HTTP parser rejected request` to identify the malformed client request.


## Developer SDK reference

The SDK reference remains a standalone `/sdk.html` page with its own RU/EN language toggle, browser/server tabs, integration examples and AI prompts for new games and existing ZIP conversion. `/documentation.html` links to this page from its contents, tools section and footer. The documentation header does not include catalogue or leaderboard navigation.

Game upload forms in the administrator panel use XMLHttpRequest upload progress, display bytes/KB/MB progress and wait for the server-side archive validation response. The page asks for confirmation before navigation while an upload is in progress.


## Admin metrics dashboard update (2026-10-11)

- `/sdk.html` remains a standalone bilingual developer page with Browser/Server tabs, usage examples and prompts for new games and existing ZIP conversion. `/documentation.html` links to it from the TOC, the tools section and footer; the documentation header does not contain Catalog or Leaderboard links.
- Admin metrics are arranged in two tabs: Games and Platform status. Widgets can be dragged to reorder, collapsed, hidden and restored; the layout persists in localStorage. Logs are contained in fixed-height scroll areas.
- Current per-game CCU is visualized as a pie chart with hover/focus tooltips and a legend. A separate errors widget merges reported game-runtime errors, error-like application events and the latest unhandled Platform API errors. The game-comparison pie chart represents distinct players today (not current CCU); current CCU is shown separately in the platform-history charts. Platform API errors are currently held in memory (latest 100), not persisted, so they reset on restart.
- Admin game table displays title in its own column and game type in a separate column. Admin email is not displayed in the administration workspace or player leaderboard details.
- The game detail modal places Play and Share actions immediately below the capsule.
- Validation: `npm test` passes, including syntax checks, Data API/auth/runtime/proxy tests and UI regression assertions. Browser and Docker end-to-end checks were not run in this environment.

## Admin dashboard and API documentation update (2026-10-11)

- Dashboard widgets use two columns on landscape layouts and a single column on narrow portrait screens. Each widget has a dedicated drag grip; pointer-based sorting supports mouse, pen and touch. Collapse/hide/restore state and order persist in the browser. The reset-layout action was removed from the metrics UI.
- Metrics separate per-game unique players today (pie chart with hover/focus detail) from platform CCU history. The daily-player chart includes 7-day and longer trends; the median/rating comparison widget has game/tag filters based on canonical English tags.
- `/documentation.html` has separate Project documentation and API reference tabs. Endpoint rows expand to show request examples, including CSRF/cookie handling, JSON requests, multipart uploads and image/static routes. The API docs cover public/catalog, authentication, player/SDK, admin, support, metrics, page and SEO routes.
- `/sdk.html` remains a standalone developer page. It documents every SDK method with expandable examples, includes a complete simple clicker example and separate Browser/Server guidance and conversion prompts. Documentation links to SDK; SDK is not embedded in the documentation.
- The early theme bootstrap prevents light-background flashes before dark theme paints. Catalogue filters persist in localStorage. Favorite notifications use “Added to favourites” / “Removed from favourites”. Support modal closes on success and reports a toast.
- Validation: `npm test` passes (query-catalog, Data API, data architecture, auth/game contracts, server-runtime, proxy body and UI regression suites). Real browser and Docker end-to-end tests were not run in this authoring environment.
- Recommended follow-up: define OpenAPI 3.1 as a version-controlled source of truth and test documented endpoints against it; persist structured Platform API errors in PostgreSQL and add retention/alerting; perform touch-browser regression tests for dashboard drag/drop and theme initialization.

## Продуктовая стратегия и контракт поставки (vNext)

### Миссия и аудитория

SUPER CUBE — курируемая платформа для поиска, запуска и повторного прохождения небольших браузерных игр. Основная аудитория — игроки, которым важно начать игру без установки и лишних шагов; вторичная — независимые разработчики и издатели, которым нужны предсказуемый формат сборки, безопасная публикация и измеримые результаты распространения. Административные сценарии построены вокруг проверки и выпуска игры, а не прямого редактирования production-файлов.

### Продуктовые принципы

1. **Быстрый старт.** Опубликованная браузерная игра открывается по каноническому URL `/games/:slug`. Параметр `src` нужен только для атрибуции источника и не меняет идентификатор игры или ключ сохранения.
2. **Безопасная публикация.** Загрузка создаёт черновик; администратор проверяет его перед публикацией. Обновление заменяет версию игровых файлов, но сохраняет логическую запись игры, её ID и связанные пользовательские данные.
3. **Сервер — источник истины.** Рейтинги, отзывы, избранное, начисление очков, игровое время и multiplayer-переходы проверяются доверенным серверным кодом. Клиент инициирует действие, но не определяет результат или награду.
4. **Приватность по умолчанию.** В публичном лидерборде раскрываются только публичный ID, никнейм и очки. Email, сессии, сохранения и метаданные обращений остаются закрытыми.
5. **Наблюдаемость.** У метрики должны быть определение, окно измерения и источник. Ошибка должна включать время, сервис и безопасное сообщение; временные логи в памяти не заменяют production-аудит.
6. **Прогрессивная сложность.** Обычные игры запускаются в sandboxed iframe и используют игровой SDK. Серверный runtime включается, только если игре действительно нужны авторитетное состояние или многопользовательская логика.

### Пользовательские сценарии и показатели успеха

- **Активация игрока:** каталог → карточка игры → запуск → первая активная сессия. Воронка измеряется по шагам, а не только просмотрами страниц.
- **Возврат:** повторный запуск недавней/избранной игры и успешное восстановление облачного сохранения.
- **Публикация разработчиком:** валидный ZIP → приватный просмотр → публикация → появление в каталоге. Измерять частоту ошибок валидации и время до публикации.
- **Решение обращения:** создание заявки → первый ответ администратора → решение. Отслеживать время первого ответа, время решения и повторное открытие.
- **Надёжность:** доля ошибок API, p95 задержки, доступность Data API, успешность запуска runtime, перезапуски контейнеров и ошибки записи сохранений.

### Определения метрик

- **CCU** — количество уникальных игроков с недавней активной игровой сессией в выбранном окне. Это не число уникальных игроков за день.
- **Уникальные игроки за день** — distinct ID аккаунтов и гостевых идентификаторов, для которых записана игровая сессия за соответствующую дату по серверному определению дня.
- **Игровые сессии/запуски** — число записанных сессий; для операций, которые могут повторяться при сетевых сбоях, необходимы idempotency keys.
- **Медиана времени игры** — медиана положительных длительностей сессий за выбранный период; для интерпретации нужно показывать размер выборки.
- **Рейтинг игры** — среднее актуальных оценок игроков вместе с числом оценок. Оценка, которую поставил текущий игрок, — отдельное значение и не должна подменяться средним по игре.
- **Ошибки** — запись с уровнем, источником/сервисом, временем UTC, slug игры (если применимо), correlation ID и безопасным текстом. В production следует собирать структурированные логи централизованно.

### Правила начисления очков

Формула реализована на сервере в `src/analytics.js` и должна изменяться вместе с документацией и регрессионными тестами:

- `floor(подтверждённые активные секунды / 60)` — базовые очки за время;
- `floor(общие активные секунды / 3600) × 15` — бонус за каждый полный накопленный час;
- отзыв на каждую игру оценивается по длине самой длинной корневой версии отзыва пользователя: от 3 до 99 символов применяется `10 + floor((длина − 3) / 7)` (в текущей реализации фактический результат в этом интервале 10–23), от 100 символов — 25 очков;
- `5 × число игр`, добавленных игроком в избранное хотя бы один раз;
- `5 × число игр`, которыми игрок поделился хотя бы один раз.

Повторное добавление одной игры в избранное и повторная отправка ссылки на ту же игру не должны увеличивать бонус повторно. Базовое время начисляется по подтверждённым активным сессиям; время в фоне исключается по heartbeat/visibility-сигналам, а сервер ограничивает длину принимаемого интервала. Баллы не являются денежным балансом.

### Модель виджетов дашборда

Виджеты поддерживают обычную половинную ширину, расширенный сеточный вариант и полноэкранный подробный просмотр. Перемещение выполняется за отдельную ручку и должно работать мышью, сенсорным вводом и пером; для клавиатуры предусмотрены стрелки. Состояние расположения/размера/сворачивания — это только представление в браузере и не меняет данные метрик.

### Управление изменениями и релизами

Любое изменение контракта API, семантики SDK, расчёта очков или структуры игровых архивов требует обновить код, документацию и регрессионные тесты в одном релизе. Изменения PostgreSQL вносятся новыми нумерованными миграциями; уже применённую миграцию с checksum нельзя редактировать задним числом. Обновление архива игры должно быть staged и проверяться до переключения активной версии; статистика и сохранения при этом не удаляются.

## Развёртывание на Vercel

Инструкция по настройке Container Function и внешних сервисов: [docs/VERCEL.md](docs/VERCEL.md). Загрузки и серверные игры требуют отдельной миграции файлового хранилища; см. ограничения в инструкции.

