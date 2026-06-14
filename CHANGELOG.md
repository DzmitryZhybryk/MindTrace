# Changelog

<!-- markdownlint-disable-file MD024 -->

Все заметные изменения документируются в этом файле. Формат версий — [SemVer](https://semver.org/lang/ru/).

С июня 2026 фронт и бэк версионируются **раздельно** (одна общая нумерация продукта осталась в истории ниже):

- **Backend** — версия в `backend/pyproject.toml`. SemVer по контракту HTTP-API и машинным кодам ошибок (`code`). Теги `backend-vX.Y.Z`.
- **Frontend** — версия в `frontend/package.json`. Маркер релиза SPA (внешнего контракта нет). Теги `frontend-vX.Y.Z`.

CHANGELOG остаётся один. Новые записи группируются по дате, внутри — под-секции `### Backend X.Y.Z` / `### Frontend X.Y.Z` (а для repo-уровневых изменений — `### Project` без номера версии). Исторические записи ниже — общая продуктовая нумерация до разделения, помеченная областью (`· Backend` / `· Frontend` / `· Project`).

## 2026-06-14

### Backend 0.9.10

- **Фикс: `register` падал 500 на реальном Postgres (FK-ordering).** `AuthService.register` кладёт `user_credentials` и зависимый `refresh_token` в одну транзакцию и рассчитывает, что unit-of-work вставит родителя раньше ребёнка. Но в моделях был только голый `ForeignKey`-столбец без `relationship()` — SQLAlchemy не строила зависимость между мапперами, слала `INSERT refresh_tokens` первым и ловила `ForeignKeyViolation` на `commit()`. Каждый `register` (и зависящие от него `login`/`logout`/`session`/email-баннер e2e) отвечал 500. Добавлен `relationship()` `RefreshToken`/`Challenge` → `UserCredentials` (навигацией не используется, только ради ordering'а вставок; в `vulture_whitelist`)
- **Закрыта дыра в тест-пирамиде.** Баг не ловился ничем: unit/api — на фейках (нет реального ordering'а), integration сидил `user_credentials` отдельным закоммиченным шагом. Добавлен integration-регресс (`test_uow`): `user_credentials` + зависимый `refresh_token` в одном commit'е против реального Postgres — падал до фикса, зелёный после
- HTTP-контракт и машинные коды ошибок (`code`) не менялись — bump патчевый

### Project

- **Корневой `Makefile`-оркестратор.** Делегирует в самодостаточные `backend/` и `frontend/` через `make -C` (CWD меняется до запуска — `uv`/`npm` получают свою директорию), под-Makefile'ы не трогаются и по-прежнему запускаются из своих папок. Снимает постоянное переключение директорий: `be-%`/`fe-%` проксируют любой таргет под-Makefile (`make be-lint`, `make fe-lint`); агрегаты `lint`/`typecheck`/`check` гоняют обе стороны разом. Тесты нарезаны по зависимости от инфры: быстрые без Docker — `test-back` (backend `unit`+`api`), `test-front` (frontend `unit`+`component`), `test` (обе стороны, дейли-драйвер); тяжёлые с внешней инфрой — `test-integration` (testcontainers), `test-e2e` (Playwright + поднятый стек) и комбо `test-infra`. `.NOTPARALLEL` держит делегирование сериализованным (параллелизм — внутри pytest/vitest)

## 2026-06-13

### Backend 0.9.9

- **Integration-слой тестов с нуля.** Поднят харнесс на `testcontainers[postgres]` (реальный Postgres в контейнере на сессию, схема из `BaseDBModel.metadata` — миграция отражает её 1:1, изоляция per-test через `TRUNCATE`) + 22 теста того, что нельзя проверить на фейках: 3 auth-репозитория (round-trip entity↔БД, bulk-revoke, реальные `FOR UPDATE` row-локи через `NOWAIT`, unique/partial-unique констрейнты → `IntegrityError`), транзакционная модель UoW (`commit()` виден из новой сессии; выход без commit / исключение → rollback), lifecycle `SqlAlchemyComponent` + `db_session_dependency`
- **Unit shared-инфры.** 33 теста: `BaseHTTPClient` (маппинг success/timeout/network/5xx-апстрим → temporary, 4xx/500/429 → persistent — через `httpx.MockTransport`, без сети), `ResendClient`/`ResendComponent`, procrastinate-шина (real `App` + `InMemoryConnector`), `ComponentRegistry`, logging config/context/events, json-сериализатор
- **Api.** `HTTPLoggingMiddleware` — уровень лога по классу исхода (2xx→info / 4xx→warning / 5xx→error / необработанное исключение→error+reraise), снят через `structlog.testing.capture_logs`
- **Тулинг.** Цели `make test-integration` / `test-all` сами выводят `DOCKER_HOST` из активного docker-контекста + ставят `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` (Ryuk) — integration-тесты заводятся и в CI, и на Docker Desktop с нестандартным путём сокета, без ручной настройки
- Всего 126 → **186 тестов**, покрытие 82% → **95%**. HTTP-контракт и машинные коды ошибок (`code`) не менялись — bump патчевый

### Frontend 0.10.5

- **Закрыты дыры покрытия после рефакторинга DEV-30.** Component-тесты на новые файлы: `ErrorBoundary` (перехват throw в рендере → fallback), `RootErrorFallback` (тексты + `window.location.reload`), `AuthCard`, `AuthLayout` (с моком тяжёлого `AuthGlobe`) — все четыре доведены до 100%
- **Логика.** `useAuth` бросает вне `<AuthProvider>` (80→100%); ветка `client.ts` `invalid_response` (битый JSON под 2xx больше не уходит без теста); max-length валидации `SignUpPage` (branch 68→87.5%)
- Всего 85 → **94 теста**, branch-покрытие фронта 77.8% → **81%**. Внешнего контракта у SPA нет — bump патчевый

### Backend 0.9.8

- **Транзакционная модель UoW (Option A).** `UserService.create_user` больше не коммитит: register фиксирует `user_credentials` + `user` + refresh-токен **одной транзакцией** во владении `AuthService.register` — cross-domain атомарность, осиротевшей учётки при сбое не остаётся. `BaseUnitOfWork` очищен от мёртвых `__aenter__`/`__aexit__`/`rollback`. Создан слой `app/users/presentation/` (`user_service_dependency`); auth-зависимости больше не импортируют `users.infra`
- **Явная транзакционная граница.** `BaseUnitOfWork.transaction()` — rollback-by-default async-CM; сервисы оборачивают работу в `async with uow.transaction(): … await uow.commit()`. Область видна по блоку, `commit()` остаётся явной фиксацией; commit-then-raise (reuse-detection, invalid-code) работает внутри блока
- **Полировка.** Дедуп entity→колонки в трёх auth-репозиториях (`_to_model` + `_to_update_values` → один `_to_columns`); `ComponentRegistry` на PEP695 method-generics; опечатка `PostgressSettings` → `PostgresSettings`; имя лог-события выводится из `route.name` (shared-логирование больше не хранит маппинг доменных путей)
- **Тесты.** Unit на тело `send_verification_email` (`FakeEmailTransport` + реальный рендерер, проброс temporary/persistent ошибок); 9 дублированных фикстур подняты в корневой `tests/conftest.py`; `_PAST` → `past`-фикстура. Всего 126 тестов (unit+api)
- HTTP-контракт и машинные коды ошибок (`code`) не менялись — поэтому bump патчевый

### Frontend 0.10.4

- **Архитектура auth-экранов.** Извлечены `AuthLayout` + `AuthCard` из Login/SignUp (вёрстка дословно сохранена); magic-hex сведены в CSS-токены (`--brand-ink`, `--auth-page-bg`, `--auth-card-*`, `--globe-bg`)
- **Устойчивость к сбоям.** Корневой `ErrorBoundary` (fallback `RootErrorFallback`) держит UI от белого экрана; локальный вокруг `AuthGlobe` изолирует сбой WebGL/three.js, не ломая форму. `parseSuccess` оборачивает `JSON.parse` в try/catch → `ApiError(code:"invalid_response")` (битый JSON под 2xx больше не роняет голым `SyntaxError`; +i18n en/ru)
- **Чистка.** Удалён dev-`src/sandbox/` целиком + роут `/sandbox` — мёртвый код и дубль глобуса
- **Тесты.** `AuthContext.test.tsx` (bootstrap refresh 401/200, verify/auth-required, сброс verify-баннера); стабилизация кликов по Mantine-меню хелпером `findMenuItem`; кейс no-op при выборе активного языка. Всего 85 тестов
- Внешнего контракта у SPA нет — bump патчевый

### Project

- Дрейф документации устранён: `CLAUDE.md` (`Password(hash=...)` вместо удалённого `from_hash`, frontend `make lint` = oxlint, реальный `-> Self`-пример); `backend/pyproject.toml` — удалён мёртвый per-file-ignore на несуществующий `app/infra/components/registry.py` (RUF002/003 уже в глобальном ignore); `.claude/agents/architecture-reviewer.md` — `resolve_http_status`/`ErrorCategory` вместо `DOMAIN_EXCEPTION_MAPPING`; `.claude/rules/typescript/testing.md` — ESLint → oxlint, описан `VITEST_SCOPE` (unit=`*.test.ts`, component=`*.test.tsx`)

## 2026-06-12

### Frontend 0.10.3

- Введён **e2e-слой** (Playwright Test) — последняя ступень тест-пирамиды. 14 спеков гоняют real-stack auth/session-флоу против поднятого docker-стека: регистрация/логин (по username и email)/логаут, `ProtectedRoute` + bootstrap-refresh из cookie (reload/новая вкладка), атрибуты refresh-cookie (`HttpOnly`/`SameSite`/`Secure`), напоминание о верификации email. Внешний контракт SPA не меняется — поэтому bump патчевый
- **Прагматичная раскладка по слоям пирамиды:** e2e берёт только то, что MSW-компонентные тесты не достают (настоящий бэкенд-контракт, реальные HttpOnly-cookie, межвкладочный sessionStorage, real-browser-расхождения). Микровалидация форм, диалог верификации, single-flight refresh на 401 осознанно остаются в component/unit-тестах (`SignUpPage`/`LoginPage`/`VerifyEmailDialog`/`client.test`) — без дублирования. Не покрыты в e2e по конструкции: verify-success (код хранится Argon2-хешем, недостижим; флоу покрыт `VerifyEmailDialog.test`) и форс-состояния challenge (expired/attempts → бэкенд-тесты)
- Инфра e2e в `frontend/e2e/`: хелперы (`registerUser`/`loginViaUi`/`getRefreshCookie`) + фикстуры `freshUser`/`authedPage`, уникальный юзер на прогон (сид через API). `playwright.config.ts` получил кап воркеров (`CI?2:4`) и `expect.timeout=15000` — argon2 на register/login насыщает CPU при полной параллельности. `vite.config.ts` `test.include` сужен до `src/**/*.test.{ts,tsx}` — дефолтный глоб Vitest ловил и e2e-`*.spec.ts` (Playwright), ломая `make check`; теперь чёткое разделение: `.test.ts` в `src/` → Vitest, `.spec.ts` в `e2e/` → Playwright
- **Кросс-браузер:** матрица chromium + firefox + webkit (37 passed). На WebKit точечно пропущены 5 cookie-зависимых тестов (logout-cleanup, bootstrap-refresh, cookie-атрибуты, межвкладочный баннер): Safari/WebKit отвергает `Secure`-cookie по `http://localhost` (Chromium/Firefox считают localhost secure-контекстом), поэтому refresh/bootstrap-флоу на webkit против http-стека недоступен (в проде по https — работал бы). Skip явный, с причиной (`test.skip(browserName === "webkit", ...)`); остальные 9 флоу на webkit гоняются штатно. Снять skip при появлении https-`E2E_BASE_URL`
- **Playwright MCP** (`.mcp.json`, headless) для интерактивного авторинга спеков агентом — водит живой UI через `browser_*`, на выходе детерминированный TS-спек. Только инструмент авторинга, в CI не участвует

## 2026-06-11

### Project

- Фронтенд-линтер мигрирован с **ESLint на oxlint** (Rust-линтер из проекта `oxc`). Удалены `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` (−127 пакетов) и `eslint.config.js`; добавлены `oxlint` + `.oxlintrc.json`. Скрипты `lint`/`lint:fix` и цели `make lint`/`lint-fix` теперь зовут oxlint — линтер один, без второго инструмента в связке. Тулинг-изменение → секция `Project` без бампа версии фронта
- Покрытие сохранено 1:1: включён `react`-плагин oxlint, правила `react/rules-of-hooks` (error), `react/exhaustive-deps` (warn), `react/only-export-components` (warn) зеркалят прежние `eslint-plugin-react-hooks`/`react-refresh`; override снимает `only-export-components` с тест-файлов (`src/test/**`, `*.test.*`) — как было в ESLint. Категория `correctness` поднята до `error` как гейт. oxlint гоняет 116 правил по 47 файлам с 0 проблем; `make check` зелёный (typecheck + 79 тестов)
- Type-aware правила не вводились намеренно: конфиг держался на `tseslint.configs.recommended` (**non**-type-checked), таких правил в проекте не было — поэтому полная замена возможна уже сейчас, без ожидания GA oxlint type-aware. На радаре остался один шаг — перейти на форматтер `oxc`, когда он выйдет (закроет отсутствующий в проекте форматтер; см. `docs/tech-radar.md`)
- **oxlint расширен правилами безопасности, a11y и качества.** Включены плагины `import`/`promise`/`jsx-a11y`/`vitest`. Безопасность: `react/jsx-no-target-blank` (reverse-tabnabbing), `react/jsx-no-script-url` + `no-script-url` (`javascript:`-XSS), `react/no-danger` (`dangerouslySetInnerHTML`). Правила проекта из CLAUDE.md стали исполняемым CI-гейтом: `typescript/no-explicit-any`, `no-console`, `no-param-reassign`, `prefer-const`, `eqeqeq`, `no-debugger`, `react/no-array-index-key`. Под «жёлтые» правила поправлено 16 мест (`require-unicode-regexp` ×13 → флаг `/u`; `react/no-unescaped-entities`; `jsx-a11y/prefer-tag-over-role` ×2: `<div role="region">`→`<section>`, убран `role="img"` с плейсхолдера глобуса). `unicorn/no-useless-undefined` намеренно НЕ включён — false positive на React 19 `useRef(undefined)` (там аргумент обязателен). `make check` зелёный (oxlint 0 / tsc / 79 тестов)
- **Бэкенд: подключён `uv audit`** (uv-нативный скан уязвимостей + malware). Для этого uv обновлён **0.9.9 → 0.11.20** (`audit` зарелижен в июне 2026). Скан нашёл 13 уязвимостей — закрыты бампом 6 пакетов: `pyjwt` 2.12.1→2.13.0 (прямая зависимость, ×4 CVE), `starlette` 1.0.0→1.3.0, `urllib3`→2.7.0, `idna`→3.18, `mako`→1.3.12, `python-multipart`→0.0.32. После бампа `uv audit` → 0 уязвимостей в 85 пакетах, 122 теста зелёные. Добавлена цель `make audit`, заведена в `make check`
- **Бэкенд: подключён `tach`** (Rust, энфорс DDD-границ импортов). `tach.toml` кодирует слоевые контракты по доменам (`domain < application < infra < presentation`; ключевая инверсия — application **↛** infra). tach сразу нашёл реальный leak: `email_verification_service` (application) импортировал конкретную procrastinate-задачу из `app.auth.infra.tasks`. Исправлено сменой контракта шины `TaskBusPort.defer(task)` → `defer(task_name: str)`: defer идёт по **имени** через `App.configure_task` (atomic defer в SA-транзакции сохранён — `connection=` прокидывается), имя-константа `SEND_VERIFICATION_EMAIL_TASK` живёт в application, infra импортит её для `@task(name=...)` (направление `infra → application`). Решение масштабируется на N тасок без роста конструкторов. `tach check` → ✅ all validated; цель `make arch`, заведена в `make check`. В `vulture` добавлен `@*.task` в `ignore_decorators` (таски вызываются воркером по регистрации, как FastAPI-роуты)
- Версию бэкенда не бампали: внешний HTTP-API и машинные коды ошибок не изменились (security-бамп зависимостей + внутренний рефактор defer-by-name контракт не трогают) — поэтому всё под `Project`, как тулинг
- `docs/tech-radar.md`: добавлена секция **backend tooling** — `Granian` (Rust ASGI-сервер, по триггеру измеренного боттлнека) и `pyx` (приватный реестр Astral, watch-only). Внедрённые `uv audit` и `tach` в радар не вносятся (они уже здесь, в CHANGELOG)

## 2026-06-07

### Backend 0.9.7

- `send_email_verification` теперь возвращает честно пустое тело на 202 (`Response(status_code=202)`) вместо JSON `null` — артефакта сериализации `None` в `JSONResponse`. Семантика 202 («принято в асинхронную обработку»: письмо ставится в очередь воркеру, клиенту нечего возвращать) сохранена; статус, `code` и поля ответа не менялись — поэтому bump патчевый
- Контекст: контракт send-verification держался на двух случайностях (FastAPI `None`→`null` + фронтовый парсер, читавший JSON на любом не-204 успехе). 202 с пустым телом REST-корректен (тело опционально, в отличие от 204) и точнее выражает async-приём; обе стороны связки сделаны явными (парный фронт-фикс — `0.10.2`)

### Frontend 0.10.2

- Введён фронтенд-набор **component-тестов** (Vitest + Testing Library + MSW): auth-формы (`LoginPage`/`SignUpPage`), `VerifyEmailDialog`, `EmailVerificationBanner`, `LanguageSwitcher`, `AuthHeader`, `HomePage`, `ProtectedRoute` — 34 теста. Classicist: мокается только сетевая граница (MSW = «API fakes»), запросы как у пользователя (`getByRole`/`getByLabelText`/`findByText`), навигация наблюдается через landing-маркеры (без слежки за `useNavigate`). Внешний контракт SPA не меняется — поэтому bump патчевый
- Общие seam'ы в `src/test/`: `setup.ts` (jest-dom, моки `matchMedia`/`ResizeObserver`, MSW lifecycle, сбросы `tokenStore`/`sessionStorage`), `handlers.ts` (реюзабельные MSW-handlers `/v1/auth/*` + билдер токена), `render.tsx` (`renderWithProviders`/`renderRoutes`/`makeAuthValue`). `react-globe.gl` мокается на auth-страницах (WebGL вне jsdom)
- Закалён `api/client.ts` `parseSuccess`: успешный ответ с пустым телом (204 либо любой 2xx без контента, напр. 202 на send-verification) больше не падает на `response.json()` — отдаёт `undefined` (через `response.text()`); покрыто unit-тестом. Фронт устойчив к контракту 202 независимо от формы тела (парный фикс к backend `0.9.7`)
- eslint: `react-refresh/only-export-components` отключён для тест-файлов (`src/test/**`, `*.test.*`) — правило Vite HMR неприменимо к тест-хелперам, экспортирующим и провайдеры, и функции

### Backend 0.9.6

- Введён бэкенд-набор **api-тестов** (pytest, `httpx.ASGITransport`) — auth-роуты гоняются через ASGI без реальной БД: 37 тестов, exhaustive по матрице достижимых HTTP-статусов. `register` (201+cookie / 400 / 409×2 / 422×3), `login` (200+cookie / 401×2 / 422), `logout` (204+clear / идемпотентность), `refresh` (200+ротация / 401×4), `email/send-verification` (202 / 401×2 / 404 / 409 / 429), `email/verify` (204 / 400 / 404×2 / 409 / 410 / 429 / 422) и контракт ошибок (envelope `{code,message,details,timestamp}`, `details.field`, `validation_error` с `details.fields[]`, 500 `{code:internal}` без утечки). Внешний HTTP-API и коды ошибок не изменились — поэтому bump патчевый
- Classicist-сборка: поднимается **настоящий** DI-граф FastAPI, выпуск/декод JWT, куки и exception-handler'ы; фейкается только I/O-граница (UoW/репо, users-client, task-bus, argon2) через `app.dependency_overrides`, переиспользуя классы фейков из `tests/fakes/`. Bearer-токены выпускаются тем же `get_jwt_service()`, которым приложение их и декодит
- Раскладка harness симметрична unit-уровню: `tests/api/conftest.py` — домен-агностичная generic-проводка (`api_app` без компонентов, generic-сборка `app` из `router`/`router_prefix`/`dependency_overrides`, `client`, фейки shared-инфры, `mint_access_token`); `tests/api/auth/conftest.py` — только auth-данные. Второй домен переиспользует generic-`app`/`client`, отдав три data-фикстуры
- Закрыты два остававшихся пробела unit-покрытия: `InternalUsersClient` (адаптер auth→users, ловит дрейф полей `CreateUserRequest`↔`CreateUserCommand`) и страховочные ветки `shared/exceptions/handlers` — оба доведены до 100%. Покрытие `app/auth/presentation` — 95% (routes/cookies/responses/schemas 100%; в `dependencies.py` не покрыты только тела листовых deps, которые и подменяются override'ами). Весь suite — 122 теста
- Тестовый `JWT_SECRET_KEY` в корневом conftest доведён до ≥32 байт — глушит `InsecureKeyLengthWarning` от settings-бэкенного `JWTService` (юнит-тесты со своим секретом не затронуты)

## 2026-06-06

### Backend 0.9.5

- Введён бэкенд-набор **unit-тестов** (pytest, `asyncio_mode=auto`): domain + application доменов `auth` и `users`, shared-инфраструктура crypto/jwt и pure-хелперы (`resolve_http_status`, классификация исключений для логирования). 82 теста; покрытие целевых domain/application/shared-pure модулей — 100%, `jwt/service.py` — 97% (не покрыта только bootstrap-фабрика из `settings`)
- Раскладка `tests/{unit,integration,api}/<домен>/<слой>` с авто-маркировкой по пути (маркеры уровня `unit`/`integration`/`api` и домена `auth`/`users`/`shared` проставляются хуком `pytest_collection_modifyitems`, вручную не тегаются). Classicist-подход: рукописные in-memory фейки в `tests/fakes/`, реализующие те же порты, что и боевые реализации (`ty` ловит расхождение сигнатур); детерминизм через явные timestamp'ы и `FakeSaltedHasher` вместо медленного argon2
- DIP домена `users` доведён до владельца контракта: добавлен `app/users/application/ports.py` (`UserRepositoryPort`, `UserUnitOfWorkPort`); `UserRepository`/`UserUnitOfWork` явно реализуют порты, `UserService` зависит от порта, а не от конкретного UoW. Внешний HTTP-API и коды ошибок не изменились — поэтому bump патчевый
- Покрыты ранее не тестированные ветки: негативные пути `JWTService.decode_access_token` (чужая подпись, истёкший токен, битый формат, отсутствующий/не-UUID `sub`) и реальный `Argon2SaltedHasher.verify` (hash→verify roundtrip + неверный секрет + уникальная соль на вызов)

### Frontend 0.10.1

- Введён фронтенд-набор **unit-тестов** (Vitest + jsdom): чистая логика `api/` и `auth/` — 44 теста. Покрытие целевых модулей 100% (`api/errors`, `auth/jwt`, `auth/tokenStore`, `auth/events`, `auth/verifyBannerStorage`) и `api/client` 100% — single-flight refresh, 401-retry с повтором, гарды (`invalid_credentials`/`email_not_verified`/сам refresh-path), события `verify-required`/`auth-required`; это ровно те ветки, что в ручном QA были сложно воспроизводимы (D2/E1/E2). Внешний контракт SPA не меняется — bump патчевый
- Раскладка co-located `*.test.ts` рядом с модулем; classicist-подход — мокается только сетевая граница (`fetch` через `vi.stubGlobal`), всё под ней (token store, jwt-decode, error-mapping, zod) исполняется по-настоящему
- Сетап: `test`-блок в `vite.config.ts` (jsdom, v8-coverage без порога), скрипты `test`/`test:run`/`coverage`, синхронный bootstrap i18n в `src/test/setup.ts`. Тестовые API импортируются явно из `vitest` (без global-инъекции, дефолт Vitest) — app-код не видит `describe`/`it`/`vi`
- Заведён `.claude/rules/typescript/testing.md` — конвенции FE-тестов (пирамида unit/component/e2e, «мок только сеть», детерминизм, reuse-before-create); component (Testing Library + MSW) и e2e (Playwright) — последующие фазы
- Безопасность: `npm audit fix` обновил уязвимые зависимости — `react-router`/`react-router-dom` 7.14.x → 7.17.0 (high: DoS через unbounded path expansion в `__manifest`) и транзитивный `brace-expansion` (moderate). `npm audit` → 0 уязвимостей; диапазоны версий в `package.json` не менялись (фикс в пределах `^7.14.1`)

### Project

- Добавлен `frontend/Makefile` — зеркалит backend-нейминг (`make lint`/`typecheck`/`test`/`coverage`/`check`), тонкая обёртка над npm-скриптами для единого интерфейса по монорепо. В `package.json` добавлены скрипты `typecheck` (`tsc -b`) и `lint:fix` (`eslint --fix`)
- `make test-all` теперь печатает coverage (`--cov=app --cov-report=term-missing`); `make check` дополнен прогоном `test-all` (полный конвейер: format → lint → typecheck → dead-code → тесты с покрытием)
- `.claude/rules/python/testing.md` расширен: правило **«Reuse before create»** (сверяться с уже существующими фикстурами/фейками/билдерами до создания новых), трёхуровневая модель conftest (корневой suite-wide / `tests/unit` cross-domain unit-only / доменный) и требование «фикстуры живут только в conftest, не рядом с тестом»
- Из инженерных правил `.claude/` убран принцип **YAGNI**: проект осознанно допускает оверинженеринг ради чистой архитектуры под будущий microservices-split (вычищены `rules/common/coding-style.md`, `rules/python/testing.md`; формулировки в `agents/architecture-reviewer.md` переписаны без апелляции к YAGNI)

## 2026-06-05

### Project

- Монорепо реорганизован: бэкенд переехал в `backend/` (самодостаточный uv-проект — `app`, `migrations`, `tests`, `pyproject.toml`/`uv.lock`, `alembic.ini`, `Dockerfile`, `Makefile`), фронтенд — в `frontend/`; в корне осталась оркестрация (`docker-compose.yaml`, `.env`, конфиги логирования, `docs/`). Стек по-прежнему поднимается из корня одной командой `docker compose up -d`
- Версионирование разделено на **Backend** (`backend/pyproject.toml`) и **Frontend** (`frontend/package.json`) — раньше единая версия жила в одном `pyproject`. Ошибочный bump бэка (`0.10.0` за чисто фронтовую i18n) откатан до `0.9.4`, фронту проставлена фактическая `0.10.0`
- `CLAUDE.md` убран из `.gitignore` — теперь трекается в репозитории
- `docs/architecture.md` ужат до принципов DDD: дерево файлов выводится из кода, а не ведётся руками (источник истины по структуре и конвенциям — `CLAUDE.md`)

## [0.10.0] 2026-06-05 · Frontend

### Добавлено

- Интернационализация фронтенда (i18next + react-i18next): полная поддержка EN/RU с переключением языка на лету, детектом языка браузера (`navigator` → fallback EN) и persist в `localStorage`. Архитектура масштабируется на N языков — новый язык = папка `locales/<code>/` + одна запись в реестре `SUPPORTED_LANGUAGES`, без правок в компонентах и переключателе
- Реестр языков `src/i18n/languages.ts` (`SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE`, `LanguageCode`) и lazy-load локалей через `i18next-resources-to-backend` (dynamic `import()` — bundle не растёт с числом языков); namespace'ы `common` / `auth` / `errors`
- Компонент `LanguageSwitcher` (опции из реестра) в `AuthHeader` и на `HomePage`; синк `<html lang>` при смене языка

### Изменено

- Все user-facing строки auth-поверхности (`LoginPage`, `SignUpPage`, `VerifyEmailDialog`, `EmailVerificationBanner`) и shell (`HomePage` chrome) переведены на `t()`; mock-данные Home намеренно не локализованы
- `messageForCode` / `applyApiError` (`api/errors.ts`) стали фасадом над standalone-инстансом i18next (`i18n.t('errors:' + code)`) — тексты ошибок переехали из `errors.ts` в `locales/{en,ru}/errors.json` (ключи = backend `code`); валидация форм резолвит сообщения лениво через `t()`, поэтому реагирует на смену языка

### Удалено

- Словарь `ERROR_MESSAGES` и дубль литерала "Network error" — заменены ключами в `errors.json`

## [0.9.4] 2026-05-24 · Backend

### Изменено

- Доменные исключения стали транспортно-нейтральными: вместо HTTP-привязки введена `ErrorCategory`, а перевод категории в HTTP-статус живёт единственным маппингом в HTTP-адаптере (`resolve_http_status`). Это убирает дублирование резолва (handler + логирование) и развязывает домен с транспортом — добавление gRPC/другого адаптера не требует правок домена
- Базовые классы исключений переименованы из HTTP-жаргона в доменно-семантические: `BadRequestError`→`InvalidInputError`, `UnauthorizedError`→`UnauthenticatedError`, `ForbiddenError`→`PermissionDeniedError`, `UnprocessableEntityError`→`UnprocessableError`, `TooManyRequestsError`→`RateLimitedError`, `ServerError`→`InternalError` (+ соответствующие базовые `code`). `auth.*`-коды и контракт фронта не затронуты
- `ErrorResponse`: `timestamp` теперь tz-aware (UTC); схема переведена на `model_config`/`ConfigDict` (pydantic v2)

### Исправлено

- Не-доменные (необработанные) исключения теперь дают HTTP 500 консистентно и в ответе, и в логах — раньше `ValueError` логировался как 400, а отвечал 500
- Устранена потенциальная утечка текста внутренней ошибки (`str(exc)`) в теле ответа; пример ошибки в OpenAPI больше не содержит несуществующего поля `error`

### Удалено

- Мёртвый код: `request.state.exception_handled`/`exception_type`, неиспользуемые override-параметры `register_exception_handlers`, словарь `DOMAIN_EXCEPTION_MAPPING`

## [0.9.3] 2026-05-24 · Backend

### Изменено

- Таблицы переименованы во множественное число: `user`→`users`, `refresh_token`→`refresh_tokens`, `challenge`→`challenges` (единая конвенция именования; `users` заодно уходит от зарезервированного слова `user`)
- Синхронизированы длины полей FE/BE: на `/v1/auth/login/` логин и пароль валидируются только на непустоту (min 1), чтобы старые короткие пароли не блокировались на входе

### Исправлено

- FastAPI 422 (`RequestValidationError`) возвращается в едином `ErrorResponse` (`code: "validation_error"`, `details.fields`) вместо дефолтного `{"detail": [...]}` — фронт получает тот же контракт ошибки, что и для доменных исключений

## [0.9.2] 2026-05-17 · Backend

### Изменено

- Унифицированы singleton-factories для stateless-инфры: `get_argon2_salted_hasher()` и `get_sha256_deterministic_hasher()` зеркалят существующий `get_jwt_service()`. Презентационные dependency-функции теперь импортируют factory вместо прямых конструкторов — больше нет дублей инстансов hasher'ов на запрос
- `EVENT_MAPPER` (`app/shared/logging/events.py`) актуализирован — устаревший `/v1/users/register` заменён на 6 actual auth-routes (register/login/logout/refresh/email send/email verify)
- `auth_blueprint` re-export через `app/auth/infra/__init__.py` — composition root (`main.py` + `worker.py`) больше не лезет в `infra/tasks.py` напрямую

### Удалено

- Пустая директория `app/users/presentation/` (router без endpoints, schemas/responses с пустыми `__all__`). DDD-нарезка users-домена сохраняется, presentation-слой добавится обратно, когда появится первый endpoint

### Исправлено

- Драйфт документации в `CLAUDE.md`: убран несуществующий `messages` домен, переписаны секции `crypto` (`SaltedHasher`/`DeterministicHasher` + factories) и `BaseDBRepository` (`_fetch_one`/`insert`), уточнено описание `Password` value object, добавлен раздел Component+Registry vs `@cache`-factory с критерием выбора

## [0.9.1] 2026-05-17 · Backend

### Изменено

- Монолитный `AuthService` разделён на `AuthService` (register/login/logout/refresh) и `EmailVerificationService` (request/verify) — две application-роли в auth-домене, общий `AuthUnitOfWork`
- Выделен `TokenIssuer` (`app/auth/application/token_issuer.py`) — инкапсулирует выпуск refresh-секретов, их детерминированный hash и сборку `TokenPairResult`; `AuthService` больше не знает про JWT и hashing-детали
- Из `AuthServiceSettings` выделен `EmailVerificationSettings` (`app/auth/application/settings.py`) — `EmailVerificationService` получает только свой конфиг; параметры refresh-token'а живут примитивом в `TokenIssuer.__init__` (single-field конфиг не оборачиваем в settings-класс)
- Переименования в `app/shared/infra/crypto/`: `SecretHasher` → `SaltedHasher`, `Argon2SecretHasher` → `Argon2SaltedHasher` — имя протокола теперь зеркально `DeterministicHasher` по реальной property (salted vs deterministic), которая и определяет применимость
- Унифицированы singleton-factories для stateless-инфры: `get_argon2_salted_hasher()` и `get_sha256_deterministic_hasher()` зеркалят существующий `get_jwt_service()` — больше нет дублирования инстансов hasher'ов между dependency-функциями

## [0.9.0] 2026-05-11 · Backend

### Добавлено

- Эндпоинты `/v1/auth/login/`, `/v1/auth/logout/`, `/v1/auth/refresh/` — полный flow аутентификации с access-JWT и refresh-cookie
- Ротация refresh-токена с reuse detection (OAuth 2.1): использование уже отозванного токена инвалидирует все активные сессии пользователя
- Shared-компонент `DeterministicHasher` (`app/shared/infra/crypto/`) с реализацией `Sha256DeterministicHasher` — для index-lookup по детерминированному hash'у

### Изменено

- Refresh-токены хранятся как `token_hash` (SHA-256) с unique-индексом; в cookie уходит plaintext-секрет, БД компрометация не даёт rerun'нуть существующие сессии
- Из `RefreshTokenEntity` убран `last_seen_at` — его роль закрывает `updated_at` от `TimestampedEntityMixin`

## [0.8.1] 2026-05-10 · Backend

### Добавлено

- `TaskBus` / `SessionBoundTaskBus` в `app/shared/infra/procrastinate/` — atomic defer procrastinate-таски в SA-транзакции через `task_bus.bind_to(uow.session).defer(...)`

### Изменено

- Реструктуризация `app/shared/` по вертикалям-интеграциям: `infra/{di, postgres, procrastinate, email, http, jwt, crypto}` + `shared/logging/`. Старые папки `infra/components/`, `infra/clients/`, `shared/middlewares/`, `shared/dependencies/` удалены

### Исправлено

- `HTTPLoggingMiddleware`: 5xx ответы теперь логируются как `error` (раньше `warning`)

## [0.8.0] 2026-05-10 · Backend

### Добавлено

- Подтверждение email: эндпоинты `/v1/auth/email/send-verification/` и `/v1/auth/email/verify/`
- Асинхронная отправка писем через `procrastinate` + Resend (новый worker-контейнер)
- JWT-claim `email_verified` в access-токене

### Изменено

- Глобальный exception handler: 4xx-ошибки теперь корректно возвращают доменный JSON вместо 500

## [0.7.0] 2025-05-02 · Frontend

### Добавлено

- Главная страница приожения на frontend

## [0.6.0] 2025-05-02 · Backend

### Добавлено

- Регистрация пользователя
- Домены `auth` + `users`

## [0.5.0] 2025-12-30 · Backend

### Добавлено

- Глобальная обработка `Exceptions`
- `Middlewares` для базовых логов и `Exceptions`

## [0.4.0] 2025-12-30 · Backend

### Добавлено

- Логирование при помощи `structlog`

## [0.3.0] 2025-12-20 · Backend

### Добавлено

- `Docker`, `docker-compose`
- Миграции `alembic`
- Компонент для `postgresql`
- Модель `users`

## [0.2.0] 2025-12-19 · Project

### Добавлено

- Линтеры `ruff`, `ty`
- `Makefile` и `Changelog`

## [0.1.0] 2025-12-18 · Project

### Добавлено

- Инициализация проекта
