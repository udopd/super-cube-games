(() => {
  'use strict';
  const html = document.documentElement;
  const languageKey = 'supercube-lang';
  const themeKey = 'supercube-theme';
  const guestKey = 'scgames-guest-id';
  const messages = {
    ru: {
      navHome:'Главная',navCatalog:'Каталог',navAbout:'О платформе',navDocs:'Документация',navSdk:'SDK',sdkFooterLink:'SDK для разработчиков',sdkReferenceTitle:'SDK для разработчиков',sdkReferenceLead:'Руководство для браузерных и серверных игр, примеры и промпты для нейросетей.',sdkSidebar:'SDK',sdkFooterNote:'SDK ДЛЯ РАЗРАБОТЧИКОВ · БРАУЗЕР + СЕРВЕР',navLeaderboard:'Топ игроков',favoritesNav:'Мои игры',favoritesTitle:'Мои игры',favoritesLead:'Избранные игры, недавние запуски и вся игровая история.',favoritesEmpty:'В избранном пока нет игр. Добавь игру в избранное на её странице.',backToPlayers:'← Все игроки',adminLink:'Админ',myProfile:'Мой профиль',signIn:'Войти',backCatalog:'← Назад',
      eyebrow:'НЕБОЛЬШИЕ ИГРЫ · БОЛЬШИЕ ИДЕИ',heroTitle:'Играй. Открывай.<br>Возвращайся.',heroCopy:'Коллекция браузерных игр, в которые можно играть сразу — без установки и лишних шагов.',
      catalogTitle:'Каталог игр',catalogNote:'Найди свою следующую игру',searchPlaceholder:'Поиск игры или тега…',allTags:'Все теги',anyPlayers:'Любое число игроков',solo:'Один игрок',multi:'Несколько игроков',anyRating:'Любая оценка',sortNewest:'Сначала новые',sortRating:'По рейтингу',sortPlayers:'По игрокам',sortPopular:'По популярности',reset:'Сбросить',emptyCatalog:'Пока нет игр, подходящих под фильтры.',aboutTitle:'Создано для игр',aboutCopy:'Открывай независимые игры, сохраняй прогресс в аккаунте и собирай собственную коллекцию избранного.',aboutNote:'Новые игры добавляются постепенно.',footerNote:'Маленькие игры. Большие идеи.',
      profileTitle:'Мой профиль',profileSettings:'Профиль',accountSettings:'Аккаунт и безопасность',sessionSettings:'Сеанс',sessionDescription:'Завершить вход на этом устройстве.',profileAvatarTitle:'Аватар',profileAvatarSub:'Показывается рядом с твоими комментариями',nicknameTitle:'Никнейм',nicknameSub:'Имя, которое видят другие игроки',passwordSettingsTitle:'Пароль',passwordSettingsSub:'Для входа по электронной почте',profileAvatar:'Аватар 512 × 512',profileAvatarHint:'PNG, JPG или WebP. Ровно 512 × 512 пикселей, до 2 MB. На сервере хранится миниатюра 64 × 64.',uploadAvatar:'Загрузить аватар',saveProfile:'Сохранить никнейм',cancelChanges:'Отменить изменения',deleteAccountTitle:'Удалить аккаунт',deleteAccountWarning:'Аккаунт и связанные профильные данные будут удалены без возможности восстановления.',deleteAccount:'Удалить аккаунт навсегда',privacyConsentPrefix:'Я принимаю',privacyPolicyLink:'Политику конфиденциальности',privacyConsentSuffix:'.',privacyConsentRequired:'Прими Политику конфиденциальности, чтобы создать аккаунт.',currentPassword:'Текущий пароль',currentPasswordHint:'Оставь пустым, если пароль ещё не настроен',newPassword:'Новый пароль',passwordHint:'Минимум 12 символов.',changePassword:'Изменить пароль',passwordLogin:'Войти по паролю',passwordLabel:'Пароль',passwordSignIn:'Войти',docsTitle:'Документация платформы',docsLead:'Архитектура, формат игровых архивов, серверный runtime, SDK, аналитика, очки игроков и требования к развёртыванию.',recentGames:'Недавние игры',lastFive:'Последние 5',savedForLater:'Сохранено для потом',topGames:'Мои любимые',topThree:'Топ-3 по времени игры',playedGames:'Все игры, в которые я играл',signOut:'Выйти',
      authTitle:'Твоя игровая<br>история.',authIntro:'Войди, чтобы сохранять прогресс в облаке, собирать избранное, оставлять оценки и возвращаться к последним играм.',signInTitle:'Войти или зарегистрироваться',signInCopy:'Войти или создать аккаунт можно по электронной почте.',emailLabel:'Электронная почта',loginLabel:'Логин или email',sendCode:'Отправить код на почту',codeLabel:'Код из письма',verifyCode:'Подтвердить и войти',authPrivacy:'Одноразовые коды нельзя передавать другим людям.',loginTab:'Войти',registerTab:'Создать аккаунт',loginModeDescription:'Введи email, который использовал при регистрации, и запроси новый код.',registerModeDescription:'Создай аккаунт по электронной почте. Если аккаунт уже есть, переключись на вход.',registerSendCode:'Отправить код регистрации',registerVerifyCode:'Подтвердить и создать аккаунт',resendCode:'Отправить новый код',changeEmail:'Изменить email',loginCodeSuccess:'Вход выполнен. Перенаправляем…',registerCodeSuccess:'Аккаунт создан. Перенаправляем…',emailCodeSent:'Код отправлен на почту. Он действует 10 минут.',registrationCodeSent:'Код регистрации отправлен на почту. Он действует 10 минут.',devCodePrefix:'Код для локальной разработки',providerError:'Не удалось начать вход.',serverUnavailable:'Не удалось связаться с сервером.',authErrorSession:'Не удалось сохранить сессию.',authErrorAdmin:'Для этой страницы нужна учётная запись администратора.',authErrorEmail:'Введи корректный адрес электронной почты.',authErrorEmailConfig:'Отправка писем не настроена на сервере.',authErrorEmailDelivery:'Не удалось отправить письмо. Проверь подключение почтового сервера и попробуй ещё раз.',authErrorNoAccount:'Аккаунт с этой почтой не найден. Переключись на «Создать аккаунт».',authErrorAccountExists:'Аккаунт с этой почтой уже существует. Переключись на «Войти».',authErrorCodeFormat:'Введи шестизначный код из письма.',authErrorCodeExpired:'Код истёк или превышено число попыток. Запроси новый код.',authErrorCodeInvalid:'Код неверен для выбранного режима. Запроси новый код.',
      productContractEyebrow:'ПРОДУКТ И ИНЖЕНЕРИЯ',productContractTitle:'Принципы продукта и контракт релиза',productContractLead:'SUPER CUBE сокращает путь до игры, обеспечивает безопасную публикацию и сохраняет прогресс игрока. Обновление архива не меняет идентичность игры. Клиент не является доверенным источником оценок, сохранений, очков или многопользовательского состояния.',productMeasuresTitle:'Продуктовые показатели',productMeasuresList:'<li>Активация: каталог → карточка → запуск → первая активная сессия.</li><li>Возврат: повторные запуски и успешное восстановление сохранения.</li><li>Публикация: валидный архив → приватный preview → публикация.</li><li>Надёжность: ошибки API, задержка, сбои сохранений и запуска серверных игр.</li>',productBoundaryTitle:'Границы данных и runtime',productBoundaryList:'<li>Platform API владеет бизнес-правилами; Data API предоставляет разрешённые операции PostgreSQL.</li><li>Браузерные игры работают в sandboxed iframe; серверные — в изолированном runtime.</li><li>Email, секреты, сохранения и внутренние ошибки Data API не попадают в публичные ответы.</li><li>Изменения API/SDK требуют миграций, контрактных тестов и обновления документации.</li>',productMetricDefinitionsTitle:'Определения метрик',productMetricDefinitionsList:'<li>CCU означает текущую одновременную активность, а не дневную аудиторию.</li><li>Дневные игроки — уникальные аккаунты/guest ID с сессией в выбранной дате.</li><li>Рейтинг — среднее актуальных оценок с числом оценок.</li><li>Медиана — медиана положительных длительностей сессий за выбранный период.</li>',productScoreRulesTitle:'Начисление очков',productScoreRulesList:'<li>1 очко за каждую подтверждённую активную минуту и +15 за полный накопленный час.</li><li>За отзыв — 10–25 очков; 100+ символов дают 25; учитывается самый длинный отзыв по игре.</li><li>Избранное и первый share каждой игры дают бонус только один раз.</li><li>Очки не являются деньгами и рассчитываются сервером.</li>',productContractLinks:'Контракты интеграции и примеры доступны на странице <a href="/sdk.html">SDK</a> и в <a href="#docsApiPanel">справочнике API</a>.',apiContractTitle:'Контракт запросов и ошибок',apiContractBody:'API использует JSON, если маршрут не принимает multipart/form-data. Запись требует cookie текущей сессии и X-CSRF-Token из /api/bootstrap. Административные маршруты проверяют роль на сервере; сокрытие кнопки в UI не является контролем доступа. Ошибки возвращают HTTP-статус и безопасное поле error; клиенты не должны разбирать внутренние стеки Data API.',apiContractList:'<li>400 — некорректное тело или параметры; 401 — нет действующей сессии; 403 — CSRF/роль запрещает действие; 404 — ресурс недоступен или не существует; 409 — конфликт состояния/уникальности; 429 — превышен лимит запросов; 5xx — серверная ошибка.</li><li>Повтор операции с побочным эффектом должен быть безопасным или защищённым idempotency key.</li><li>Не передавайте пароли, одноразовые коды, Data API токены и секреты в query string.</li>',sdkContractNoteTitle:'SDK contract · v1.1',sdkContractNoteBody:'Вызовы Browser SDK — запросы к платформе, а не доверенный источник истины. Для одиночной игры можно держать презентационное состояние на клиенте, но результаты, переходы состояния и multiplayer-действия должны проверяться сервером. Используй стабильный slug игры, ожидай завершения SDK-вызовов, обрабатывай гостевой режим и сетевые ошибки; не добавляй секреты в ZIP-архив.',modalClose:'Закрыть',shareGame:'Поделиться игрой',gameScreenshots:'Скриншоты',reviews:'Отзывы',writeReview:'Написать отзыв…',publishReview:'Опубликовать',noReviews:'Пока нет отзывов.',signInToReview:'Войдите, чтобы оценить игру или оставить отзыв.',reviewSaved:'Отзыв опубликован',shareDone:'Ссылка на игру готова',shareCopied:'Ссылка скопирована',reply:'Ответить',edit:'Изменить',delete:'Удалить',adminReply:'Ответ администрации',ratingSaved:'Оценка сохранена',played:'Играли',infoScore:'<strong>Как начисляются очки</strong><ul><li><b>Активное время:</b> 1 очко за каждую минуту подтверждённой игровой сессии. Время в скрытой/фоновой вкладке не засчитывается.</li><li><b>Бонус за время:</b> дополнительно 15 очков за каждый полный накопленный час игры на платформе.</li><li><b>Отзывы:</b> 10–25 очков за содержательный отзыв; итог зависит от длины и полноты, отзыв от 100 символов приносит максимум — 25 очков. Для одной игры учитывается только самый длинный отзыв игрока; редактирование может изменить начисление.</li><li><b>Избранное:</b> 5 очков за каждую игру, добавленную в избранное, один раз на игру.</li><li><b>Поделиться:</b> 5 очков за первую подтверждённую отправку ссылки на каждую игру; повторные отправки одной игры баллов не дают.</li></ul><p>Все очки рассчитываются сервером. Повторные запросы не должны начислять одни и те же бонусы повторно. Очки не являются денежным балансом.</p>',play:'Играть',players:'игроков',playersRange:'игроков',sessions:'запусков',noData:'Пока нет данных в этой категории.',openGame:'Открыть игру',favorite:'В избранное',unfavorite:'Убрать из избранного',favoriteAdded:'Добавлено в избранное',favoriteRemoved:'Удалено из избранного',playTime:'Время игры',player:'игрок',stars:'звёзд',countGames:'игр в каталоге',rateThis:'Оценка игры',adminTitle:'Панель управления',adminRole:'Администратор',runtimeTypeColumn:'Тип игры',serverGame:'Серверная',browserGame:'Обычная',adminAccessHint:'Доступна только аккаунту, указанному в ADMIN_EMAIL.',openMetrics:'Открыть все метрики ↗',recommendationsTitle:'Рекомендации',uploadGameTitle:'Загрузить игру',zipLimit:'ZIP · до 100 MiB',dropArchive:'Перетащи ZIP сюда',archiveStructure:'Нужны index.html, media/title.txt (EN), media/description.ru.txt, media/description.en.txt, media/tags.ru.txt, media/tags.en.txt и media/capsule.jpg или GIF 630 × 500. Скриншоты: media/screenshots/. Для серверного запуска: runtime.txt и server/index.js.',chooseArchive:'Выбрать ZIP',uploadGameButton:'Загрузить игру',gamesListTitle:'Игры',testUrlHint:'Тестовый preview доступен только администратору',gameColumn:'Игра',statusColumn:'Статус',playersSessionsColumn:'Игроки / запуски',ratingColumn:'Рейтинг',medianColumn:'Медиана',interactionsColumn:'Взаимодействия',actionsColumn:'Действия',editGameTitle:'Редактировать игру',close:'Закрыть',titleEnglish:'Название на английском',descriptionRu:'Описание на русском',descriptionEn:'Описание на английском',tagsRu:'Теги на русском',tagsEn:'Теги на английском',minPlayersLabel:'Мин. игроков',maxPlayersLabel:'Макс. игроков',runtimeType:'Тип запуска',browserRuntime:'Браузерный iframe',serverRuntime:'Серверный runtime (Docker)',replaceCapsule:'Заменить капсулу (JPG/GIF, 630 × 500)',saveChanges:'Сохранить изменения',metricsTitle:'Метрики платформы',dashboardGames:'Игры',dashboardPlatform:'Состояние платформы',dashboardReset:'Сбросить блоки',dashboardLayoutNote:'Перетаскивай блоки за заголовок, сворачивай или скрывай их. Расположение сохранится в этом браузере.',dashboardCoreStats:'Основные показатели',dashboardPlatformHealth:'Состояние платформы',dashboardRuntimeErrors:'Ошибки платформы и игр',dashboardRestore:'Восстановить',dashboardCollapse:'Свернуть/развернуть',dashboardHide:'Скрыть блок',monitoringTitle:'Мониторинг платформы и серверных игр',refreshMonitoring:'Обновить мониторинг',runtimeColumn:'Runtime',diagnosticsColumn:'Диагностика',timestampColumn:'Время',eventColumn:'Событие',sourceColumn:'Источник',serverGamesTitle:'Серверные игры',recentEventsTitle:'Последние события платформы',gameNoRuntime:'Нет диагностики runtime',metricGameUsage:'Игры: запуски и время',metricShares:'Популярность и взаимодействия',adminLeaderboard:'Топ игроков',adminPlayerDetailNote:'Нажми на строку, чтобы открыть профиль игрока',gameMetrics:'Метрики по играм',leaderboardTitle:'Топ игроков платформы',leaderboardLead:'Играй, оставляй полезные отзывы и открывай новые игры. Очки считаются на сервере.',leaderboardTop:'Рейтинг игроков',playerId:'ID игрока',nickname:'Никнейм',points:'Очки',publicPrivacy:'Публично показываются никнейм и очки. Данные профиля и почта скрыты.',refreshMetrics:'↻ Обновить',metricUpdated:'Аккаунты, время и события считаются на сервере.',colPlayer:'Игрок',colPoints:'Очки',colTime:'Время',colGames:'Игр',colReviews:'Отзывы',colFavorites:'Избранное',colShares:'Поделиться',colGame:'Игра',colStatus:'Статус',colUniquePlayers:'Игроки',colSessions:'Запуски',colPlaytime:'Активное время',colRating:'Рейтинг',writePlayer:'Написать игроку',mailTemplate:'Шаблон',mailSubject:'Тема',mailSend:'Отправить письмо',templateWelcome:'Приветствие',templateFeedback:'Благодарность за отзыв',templateUpdate:'Новости платформы',templateCustom:'Пустое письмо',recommendationsLead:'Приоритизированный список улучшений, основанный на архитектуре и текущем MVP платформы.',loadingData:'Загрузка…',noMetrics:'Нет данных в этой категории.',pingChecking:'Пинг: проверяем…',pingStarting:'Пинг: запускается…',pingOffline:'Пинг: недоступен'
    },
    en: {
      navHome:'Home',navCatalog:'Catalog',navAbout:'About',navDocs:'Docs',navSdk:'SDK',sdkFooterLink:'Developer SDK',sdkReferenceTitle:'Developer SDK',sdkReferenceLead:'Guidance for browser and server games, examples, and AI prompts.',sdkSidebar:'SDK',sdkFooterNote:'DEVELOPER SDK · BROWSER + SERVER',navLeaderboard:'Leaderboard',favoritesNav:'My games',favoritesTitle:'My games',favoritesLead:'Your favourites, recent launches, and full play history.',favoritesEmpty:'No favourite games yet. Add a game to your favourites from its page.',backToPlayers:'← All players',adminLink:'Admin',myProfile:'My profile',signIn:'Sign in',backCatalog:'← Back',
      eyebrow:'SMALL GAMES · BIG IDEAS',heroTitle:'Play. Discover.<br>Come back.',heroCopy:'A collection of browser games you can play right away — no install and no extra steps.',
      catalogTitle:'Game catalogue',catalogNote:'Find your next game',searchPlaceholder:'Search games or tags…',allTags:'All tags',anyPlayers:'Any player count',solo:'Single player',multi:'Multiplayer',anyRating:'Any rating',sortNewest:'Newest first',sortRating:'By rating',sortPlayers:'By players',sortPopular:'Most played',reset:'Reset',emptyCatalog:'No games match these filters yet.',aboutTitle:'Made for games',aboutCopy:'Discover indie games, keep your progress in your account and build your own favourites collection.',aboutNote:'New games are added gradually.',footerNote:'Small games. Big ideas.',
      profileTitle:'My profile',profileSettings:'Profile',accountSettings:'Account and security',sessionSettings:'Session',sessionDescription:'Sign out on this device.',profileAvatarTitle:'Avatar',profileAvatarSub:'Shown next to your comments',nicknameTitle:'Nickname',nicknameSub:'The name other players see',passwordSettingsTitle:'Password',passwordSettingsSub:'For email sign-in',profileAvatar:'Avatar 512 × 512',profileAvatarHint:'PNG, JPG or WebP. Exactly 512 × 512 pixels, up to 2 MB. A 64 × 64 thumbnail is stored on the server.',uploadAvatar:'Upload avatar',saveProfile:'Save nickname',cancelChanges:'Cancel changes',deleteAccountTitle:'Delete account',deleteAccountWarning:'Your account and related profile data will be permanently deleted.',deleteAccount:'Delete account permanently',privacyConsentPrefix:'I accept the',privacyPolicyLink:'Privacy Policy',privacyConsentSuffix:'.',privacyConsentRequired:'Accept the Privacy Policy to create an account.',currentPassword:'Current password',currentPasswordHint:'Leave empty if you have not set a password yet',newPassword:'New password',passwordHint:'At least 12 characters.',changePassword:'Change password',passwordLogin:'Sign in with password',passwordLabel:'Password',passwordSignIn:'Sign in',docsTitle:'Platform documentation',docsLead:'Architecture, game archive format, server runtime, SDK, analytics, player points and deployment requirements.',recentGames:'Recently played',lastFive:'Last 5',savedForLater:'Saved for later',topGames:'My favourites by playtime',topThree:'Top 3 by time played',playedGames:'All games I played',signOut:'Sign out',
      authTitle:'Your gaming<br>history.',authIntro:'Sign in to save progress in the cloud, collect favourites, rate games and return to your recent plays.',signInTitle:'Sign in or create an account',signInCopy:'Sign in or create an account with your email address.',emailLabel:'Email address',loginLabel:'Username or email',sendCode:'Send an email code',codeLabel:'Email verification code',verifyCode:'Verify and sign in',authPrivacy:'Never share a one-time sign-in code with anyone.',loginTab:'Sign in',registerTab:'Create account',loginModeDescription:'Enter the email address you used before and request a fresh code.',registerModeDescription:'Create an account with your email. If you already have an account, switch to Sign in.',registerSendCode:'Send registration code',registerVerifyCode:'Verify and create account',resendCode:'Send a new code',changeEmail:'Change email',loginCodeSuccess:'Signed in. Redirecting…',registerCodeSuccess:'Account created. Redirecting…',emailCodeSent:'A code was sent to your email. It expires in 10 minutes.',registrationCodeSent:'A registration code was sent to your email. It expires in 10 minutes.',devCodePrefix:'Local development code',providerError:'Could not start sign-in.',serverUnavailable:'Unable to contact the server.',authErrorSession:'Could not save the session.',authErrorAdmin:'This page requires an administrator account.',authErrorEmail:'Enter a valid email address.',authErrorEmailConfig:'Email delivery is not configured on the server.',authErrorEmailDelivery:'The email could not be delivered. Check the mail server connection and try again.',authErrorNoAccount:'No account was found for this email. Switch to Create account.',authErrorAccountExists:'An account already exists for this email. Switch to Sign in.',authErrorCodeFormat:'Enter the six-digit code from your email.',authErrorCodeExpired:'The code expired or the attempt limit was reached. Request a new code.',authErrorCodeInvalid:'This code does not match the selected mode. Request a new code.',
      productContractEyebrow:'PRODUCT & ENGINEERING',productContractTitle:'Product principles and release contract',productContractLead:'SUPER CUBE reduces time-to-play, enables safe publishing and preserves player progress. Replacing an archive does not change the logical game identity. The client is not trusted for ratings, saves, points or multiplayer state.',productMeasuresTitle:'Product measures',productMeasuresList:'<li>Activation: catalogue → detail → launch → first active session.</li><li>Return: repeat launches and successful cloud-save restore.</li><li>Publishing: valid archive → private preview → published.</li><li>Reliability: API errors, latency, save failures and server-game startup success.</li>',productBoundaryTitle:'Data and runtime boundaries',productBoundaryList:'<li>Platform API owns business rules; Data API exposes allowlisted PostgreSQL operations.</li><li>Browser games run in a sandboxed iframe; server games use an isolated runtime.</li><li>Email, secrets, saves and internal Data API errors never appear in public responses.</li><li>API/SDK changes require migrations, contract tests and updated documentation.</li>',productMetricDefinitionsTitle:'Metric definitions',productMetricDefinitionsList:'<li>CCU means current concurrent activity, not daily audience.</li><li>Daily players are unique accounts/guest IDs with a session on the selected date.</li><li>Rating is the mean of current ratings and must include the rating count.</li><li>Median is the median of positive session durations for the selected period.</li>',productScoreRulesTitle:'Point calculation',productScoreRulesList:'<li>1 point per confirmed active minute and +15 per full cumulative hour.</li><li>Reviews earn 10–25 points; 100+ characters earn 25; only the longest review per game counts.</li><li>Favourites and the first share of each game award points once.</li><li>Points are non-monetary and calculated by the server.</li>',productContractLinks:'Integration contracts and examples are available on the <a href="/sdk.html">SDK</a> page and in the <a href="#docsApiPanel">API reference</a>.',apiContractTitle:'Request and error contract',apiContractBody:'The API uses JSON unless an endpoint expects multipart/form-data. Write requests require the current session cookie and X-CSRF-Token from /api/bootstrap. Admin routes enforce roles server-side; hiding a UI button is not access control. Errors return an HTTP status and a safe error field; clients must not parse internal Data API stacks.',apiContractList:'<li>400 — invalid body/parameters; 401 — no valid session; 403 — CSRF/role denies action; 404 — missing or unavailable resource; 409 — state/uniqueness conflict; 429 — rate limit; 5xx — server failure.</li><li>Side-effect requests should be safe to retry or protected by an idempotency key.</li><li>Never place passwords, one-time codes, Data API tokens or secrets in query strings.</li>',sdkContractNoteTitle:'SDK contract · v1.1',sdkContractNoteBody:'Browser SDK calls are requests to the platform, not a trusted source of truth. Keep presentation state client-side for single-player games, but validate results, state transitions and multiplayer actions on the server. Use a stable game slug, await SDK calls, handle guest mode and network failures, and never put secrets in the ZIP archive.',modalClose:'Close',shareGame:'Share game',gameScreenshots:'Screenshots',reviews:'Reviews',writeReview:'Write a review…',publishReview:'Publish review',noReviews:'No reviews yet.',signInToReview:'Sign in to rate or review this game.',reviewSaved:'Review published',shareDone:'Game link is ready',shareCopied:'Link copied',reply:'Reply',edit:'Edit',delete:'Delete',adminReply:'Admin reply',ratingSaved:'Rating saved',played:'Played',infoScore:'<strong>How points are awarded</strong><ul><li><b>Active playtime:</b> 1 point for each minute of a server-confirmed active session. Hidden/background-tab time is excluded.</li><li><b>Time bonus:</b> an additional 15 points for each full cumulative hour played on the platform.</li><li><b>Reviews:</b> 10–25 points for a useful review, based on length and completeness. Reviews of 100+ characters earn the maximum of 25 points. Only the longest review for each game counts; editing can change the award.</li><li><b>Favourites:</b> 5 points per game added to favourites, once per game.</li><li><b>Sharing:</b> 5 points for the first confirmed share of each game; repeat shares of the same game do not award more points.</li></ul><p>Points are calculated by the server. Duplicate requests must not award the same bonus twice. Points are not a monetary balance.</p>',play:'Play',players:'players',playersRange:'players',sessions:'plays',noData:'No games in this section yet.',openGame:'Open game',favorite:'Add favourite',unfavorite:'Remove favourite',favoriteAdded:'Added to favourites',favoriteRemoved:'Removed from favourites',playTime:'Playtime',player:'player',stars:'stars',countGames:'games in catalogue',rateThis:'Rate this game',adminTitle:'Admin dashboard',adminRole:'Administrator',runtimeTypeColumn:'Game type',serverGame:'Server',browserGame:'Browser',adminAccessHint:'Use the administrator login configured in ADMIN_LOGIN.',openMetrics:'Open all metrics ↗',recommendationsTitle:'Recommendations',uploadGameTitle:'Upload a game',zipLimit:'ZIP · up to 100 MiB',dropArchive:'Drop a ZIP here',archiveStructure:'Required: index.html, media/title.txt (English only), media/description.ru.txt, media/description.en.txt, media/tags.ru.txt, media/tags.en.txt and media/capsule.jpg/GIF 630 × 500. Screenshots go in media/screenshots/. Server runtime: runtime.txt and server/index.js.',chooseArchive:'Choose ZIP',uploadGameButton:'Upload game',gamesListTitle:'Games',testUrlHint:'Private preview available to admin only',gameColumn:'Game',statusColumn:'Status',playersSessionsColumn:'Players / plays',ratingColumn:'Rating',medianColumn:'Median',interactionsColumn:'Interactions',actionsColumn:'Actions',editGameTitle:'Edit game',close:'Close',titleEnglish:'English title',descriptionRu:'Russian description',descriptionEn:'English description',tagsRu:'Russian tags',tagsEn:'English tags',minPlayersLabel:'Min. players',maxPlayersLabel:'Max. players',runtimeType:'Runtime type',browserRuntime:'Browser iframe',serverRuntime:'Server runtime (Docker)',replaceCapsule:'Replace capsule (JPG/GIF, 630 × 500)',saveChanges:'Save changes',metricsTitle:'Platform metrics',dashboardGames:'Games',dashboardPlatform:'Platform status',dashboardReset:'Reset layout',dashboardLayoutNote:'Drag blocks by their headings, collapse or hide them. The layout is saved in this browser.',dashboardCoreStats:'Overview',dashboardPlatformHealth:'Platform health',dashboardRuntimeErrors:'Platform and game errors',dashboardRestore:'Restore',dashboardCollapse:'Collapse/expand',dashboardHide:'Hide widget',monitoringTitle:'Platform and server-game monitoring',refreshMonitoring:'Refresh monitoring',runtimeColumn:'Runtime',diagnosticsColumn:'Diagnostics',timestampColumn:'Time',eventColumn:'Event',sourceColumn:'Source',serverGamesTitle:'Server games',recentEventsTitle:'Recent platform events',gameNoRuntime:'No runtime diagnostics',metricGameUsage:'Games: plays and playtime',metricShares:'Popularity and interactions',adminLeaderboard:'Player leaderboard',adminPlayerDetailNote:'Select a row to open player details',gameMetrics:'Metrics by game',leaderboardTitle:'Platform leaderboard',leaderboardLead:'Play, leave useful reviews and discover games. Points are calculated on the server.',leaderboardTop:'Player rankings',playerId:'Player ID',nickname:'Nickname',points:'Points',publicPrivacy:'Only nickname and points are public. Profile details and email are private.',refreshMetrics:'↻ Refresh',metricUpdated:'Accounts, playtime and events are calculated server-side.',colPlayer:'Player',colPoints:'Points',colTime:'Time',colGames:'Games',colReviews:'Reviews',colFavorites:'Favourites',colShares:'Shares',colGame:'Game',colStatus:'Status',colUniquePlayers:'Players',colSessions:'Sessions',colPlaytime:'Active time',colRating:'Rating',writePlayer:'Email player',mailTemplate:'Template',mailSubject:'Subject',mailSend:'Send email',templateWelcome:'Welcome',templateFeedback:'Thanks for your review',templateUpdate:'Platform news',templateCustom:'Blank email',recommendationsLead:'A prioritized improvement roadmap based on the current platform architecture and MVP.',loadingData:'Loading…',noMetrics:'No data in this category.',pingChecking:'Ping: checking…',pingStarting:'Ping: starting…',pingOffline:'Ping: unavailable'
    }
  };
  Object.assign(messages.ru, {
    favoritesSectionTitle: 'Избранное',
    passwordLogin: 'Пароль', passwordHint: 'Минимум 6 символов.', authPrivacy: 'Данные для входа защищены. Никому не сообщайте пароль.', registerSendCode: 'Создать аккаунт и подтвердить почту', registerVerifyCode: 'Подтвердить email и создать аккаунт',
    forgotPassword: 'Забыли пароль?', forgotPasswordHelp: 'Отправим ссылку для смены пароля на адрес, указанный при регистрации.', sendResetLink: 'Отправить ссылку', backToLogin: 'Назад ко входу', registrationCodeHelp: 'Введите код из письма, чтобы подтвердить адрес и завершить регистрацию.', passwordMinHint: 'Минимум 6 символов', passwordStrengthWeak: 'Надёжность: слабая', passwordStrengthFair: 'Надёжность: средняя', passwordStrengthGood: 'Надёжность: хорошая', passwordStrengthStrong: 'Надёжность: высокая', passwordTooShort: 'Пароль должен содержать от 6 до 128 символов.', registrationExpired: 'Срок регистрации истёк. Начни заново.', resetLinkSent: 'Если аккаунт с таким адресом существует, мы отправили ссылку для сброса пароля.', resetLinkInvalid: 'Ссылка недействительна или срок её действия истёк. Запроси новую.', passwordMismatch: 'Пароли не совпадают.', passwordResetSuccess: 'Пароль обновлён. Теперь можно войти.', resetTitle: 'Новый<br>пароль.', resetIntro: 'Создай новый пароль для своего аккаунта.', resetHeading: 'Сброс пароля', confirmPassword: 'Повтори пароль', saveNewPassword: 'Сохранить новый пароль'
  });
  Object.assign(messages.en, {
    favoritesSectionTitle: 'Favourites',
    passwordLogin: 'Password', passwordHint: 'At least 6 characters.', authPrivacy: 'Keep your password private and secure.', registerSendCode: 'Create account and verify email', registerVerifyCode: 'Verify email and create account',
    forgotPassword: 'Forgot password?', forgotPasswordHelp: 'We will send a password reset link to the email address on your account.', sendResetLink: 'Send reset link', backToLogin: 'Back to sign in', registrationCodeHelp: 'Enter the email code to confirm your address and finish creating your account.', passwordMinHint: 'At least 6 characters', passwordStrengthWeak: 'Strength: weak', passwordStrengthFair: 'Strength: fair', passwordStrengthGood: 'Strength: good', passwordStrengthStrong: 'Strength: strong', passwordTooShort: 'Password must contain 6–128 characters.', registrationExpired: 'Registration expired. Start again.', resetLinkSent: 'If an account exists for that address, we sent a password reset link.', resetLinkInvalid: 'This link is invalid or expired. Request a new one.', passwordMismatch: 'Passwords do not match.', passwordResetSuccess: 'Password updated. You can now sign in.', resetTitle: 'New<br>password.', resetIntro: 'Create a new password for your account.', resetHeading: 'Reset password', confirmPassword: 'Confirm password', saveNewPassword: 'Save new password'
  });
  const getLanguage = () => localStorage.getItem(languageKey) === 'en' ? 'en' : 'ru';
  const getTheme = () => {
    const saved = localStorage.getItem(themeKey);
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  let currentLanguage = getLanguage();
  let csrfToken = '';
  let bootstrapData = null;
  let toastTimer = null;

  function applyLanguage(lang, persist = true) {
    currentLanguage = lang === 'en' ? 'en' : 'ru';
    html.lang = currentLanguage;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      const translated = messages[currentLanguage][key];
      if (translated !== undefined) element.innerHTML = translated;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const translated = messages[currentLanguage][element.dataset.i18nPlaceholder];
      if (translated !== undefined) element.placeholder = translated;
    });
    document.querySelectorAll('#languageToggle').forEach((button) => { button.textContent = currentLanguage.toUpperCase(); });
    if (persist) localStorage.setItem(languageKey, currentLanguage);
    window.dispatchEvent(new CustomEvent('sc:language', { detail: { lang: currentLanguage } }));
  }
  function applyTheme(theme, persist = true) {
    html.classList.add('theme-transitioning');
    html.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    window.setTimeout(() => html.classList.remove('theme-transitioning'), 320);
    document.querySelectorAll('#themeToggle').forEach((button) => {
      button.textContent = html.dataset.theme === 'dark' ? '☼' : '◐';
      button.setAttribute('aria-label', html.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    if (persist) localStorage.setItem(themeKey, html.dataset.theme);
    window.dispatchEvent(new CustomEvent('sc:theme', { detail: { theme: html.dataset.theme } }));
  }
  function getGuestId() {
    let value = localStorage.getItem(guestKey);
    if (!value) {
      value = window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(guestKey, value);
    }
    return value;
  }
  function updateFavoritesNav() {
    document.querySelectorAll('[data-favorites-nav]').forEach((link) => {
      link.textContent = messages[currentLanguage].favoritesNav;
    });
    document.querySelectorAll('[data-profile-nav]').forEach((link) => {
      link.textContent = messages[currentLanguage].myProfile;
    });
  }
  function installStandardFooter() {
    if (document.body.classList.contains('game-page')) return;
    let footer = document.querySelector('footer.foot, footer');
    if (!footer) {
      footer = document.createElement('footer');
      document.body.appendChild(footer);
    }
    footer.className = 'foot';
    footer.innerHTML = `<div class="container foot-inner"><a class="foot-mark" href="/">SUPER CUBE</a><div class="foot-meta"><p class="foot-note">© <span data-current-year></span> SUPER CUBE Games</p><a class="sdk-footer-link" href="/documentation.html" data-i18n="navDocs">Документация</a><a class="sdk-footer-link" href="/sdk.html" data-i18n="sdkFooterLink">SDK для разработчиков</a><a class="sdk-footer-link" href="/privacy-policy.html" data-i18n="privacyPolicyLink">Политика конфиденциальности</a></div></div>`;
    footer.querySelector('[data-current-year]').textContent = String(new Date().getFullYear());
  }
  async function refreshBootstrap() {
    const response = await fetch('/api/bootstrap', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Unable to load your session.');
    bootstrapData = await response.json();
    csrfToken = bootstrapData.csrfToken || '';
    updateFavoritesNav();
    const loginLink = document.getElementById('loginLink');
    const adminLink = document.getElementById('adminLink');
    if (bootstrapData.user) {
      if (loginLink) { loginLink.hidden = true; }
      if (adminLink) adminLink.hidden = !bootstrapData.user.isAdmin;
    } else {
      if (loginLink) loginLink.hidden = false;
      if (adminLink) adminLink.hidden = true;
    }
    return bootstrapData;
  }
  async function api(url, options = {}) {
    const opts = { ...options };
    const headers = new Headers(opts.headers || {});
    const method = String(opts.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (csrfToken) headers.set('x-csrf-token', csrfToken);
      if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
        headers.set('content-type', 'application/json');
        opts.body = JSON.stringify(opts.body);
      }
    }
    headers.set('accept', 'application/json');
    opts.headers = headers;
    opts.credentials = opts.credentials || 'same-origin';
    const response = await fetch(url, opts);
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
  function toast(message, isError = false) {
    let element = document.querySelector('.toast');
    if (!element) { element = document.createElement('div'); element.className = 'toast'; element.setAttribute('role', 'status'); document.body.appendChild(element); }
    element.textContent = String(message || 'Done');
    element.classList.toggle('error-notice', isError);
    element.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.remove(), 4200);
  }
  function formatPlayers(min, max) {
    if (Number(max) <= 1) return `1 ${messages[currentLanguage].player}`;
    if (Number(min) === Number(max)) return `${min}–${max} ${messages[currentLanguage].playersRange}`;
    return `${min}–${max} ${messages[currentLanguage].playersRange}`;
  }
  function formatTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total < 60) return `${total} sec`;
    if (total < 3600) return `${Math.floor(total / 60)} min`;
    return `${Math.floor(total / 3600)} h ${Math.floor(total % 3600 / 60)} min`;
  }
  function renderStars(value, showNumber = true) {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    const rounded = Math.round(rating);
    const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    return `<span class="rating-stars" aria-label="${rating.toFixed(1)} out of 5">${stars}</span>${showNumber ? `<span class="rating-number">${rating > 0 ? rating.toFixed(1) : '—'}</span>` : ''}`;
  }
  function installResponsiveHeaderMenus() {
    document.querySelectorAll('.topbar-inner').forEach((inner) => {
      const brand = inner.querySelector(':scope > .brand');
      if (!brand) return;
      const menuNodesSelector = '.nav, .hero-nav, .header-actions, .game-top-actions';
      let menu = inner.querySelector(':scope > .header-menu-content');
      if (!menu) {
        const nodes = [...inner.children].filter((node) => node.matches(menuNodesSelector));
        if (!nodes.length) return;
        menu = document.createElement('div');
        menu.className = 'header-menu-content';
        inner.insertBefore(menu, nodes[0]);
        nodes.forEach((node) => menu.appendChild(node));
      }
      let toggle = inner.querySelector(':scope > .header-menu-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'header-menu-toggle';
        toggle.innerHTML = '<span></span><span></span><span></span>';
        toggle.setAttribute('aria-controls', `headerMenu-${Math.random().toString(36).slice(2, 9)}`);
        toggle.setAttribute('aria-expanded', 'false');
        inner.insertBefore(toggle, menu);
      }
      menu.id = toggle.getAttribute('aria-controls');
      const updateLabel = () => {
        const open = inner.classList.contains('menu-open');
        const label = currentLanguage === 'en' ? (open ? 'Close menu' : 'Open menu') : (open ? 'Закрыть меню' : 'Открыть меню');
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      const close = () => { inner.classList.remove('menu-open'); updateLabel(); };
      if (toggle.dataset.menuBound !== '1') {
        toggle.dataset.menuBound = '1';
        toggle.addEventListener('click', (event) => {
          event.preventDefault();
          inner.classList.toggle('menu-open');
          updateLabel();
        });
        menu.addEventListener('click', (event) => {
          if (event.target.closest('a')) close();
        });
        document.addEventListener('pointerdown', (event) => {
          if (inner.classList.contains('menu-open') && !inner.contains(event.target)) close();
        });
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && inner.classList.contains('menu-open')) close();
        });
      }
      window.addEventListener('sc:language', updateLabel);
      updateLabel();
    });
  }

  function installHistoryBack() {
    document.querySelectorAll('[data-history-back]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const ref = document.referrer;
        let safePrevious = false;
        try { safePrevious = Boolean(ref && new URL(ref).origin === location.origin && history.length > 1); } catch {}
        if (safePrevious) { event.preventDefault(); history.back(); }
      });
    });
  }
  function installSharedButtons() {
    document.querySelectorAll('#languageToggle').forEach((button) => button.addEventListener('click', () => applyLanguage(currentLanguage === 'ru' ? 'en' : 'ru')));
    document.querySelectorAll('#themeToggle').forEach((button) => button.addEventListener('click', () => applyTheme(html.dataset.theme === 'dark' ? 'light' : 'dark')));
    document.querySelectorAll('#logoutButton').forEach((button) => button.addEventListener('click', async () => {
      try { const result = await api('/api/auth/logout', { method: 'POST', body: {} }); window.location.href = result.redirect || '/'; }
      catch (error) { toast(error.message, true); }
    }));
    const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
  }
  window.addEventListener('storage', (event) => {
    if (event.key === languageKey && event.newValue) applyLanguage(event.newValue, false);
    if (event.key === themeKey && event.newValue) applyTheme(event.newValue, false);
  });
  applyTheme(getTheme(), false);
  installStandardFooter();
  applyLanguage(currentLanguage, false);
  window.addEventListener('sc:language', updateFavoritesNav);
  installResponsiveHeaderMenus();
  installSharedButtons();
  installHistoryBack();
  const ready = refreshBootstrap().catch((error) => { console.error(error); return null; });
  window.SC = {
    api, ready, getGuestId, toast, formatPlayers, formatTime, renderStars,
    get language() { return currentLanguage; },
    get theme() { return html.dataset.theme; },
    get csrfToken() { return csrfToken; },
    get bootstrap() { return bootstrapData; },
    t(key) { return messages[currentLanguage][key] || key; },
    applyLanguage, applyTheme,
    refreshBootstrap
  };
})();
