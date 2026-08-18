# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MindTrace is a FastAPI service (Python 3.14+, async) using Domain-Driven Design. Package manager is **uv**. Database is PostgreSQL via SQLAlchemy 2.0 async (typed ORM: `DeclarativeBase` + `Mapped`/`mapped_column`). Runs in Docker with a Loki/Promtail/Grafana logging stack.

### Архитектурная политика (осознанные решения владельца)

- **Монолит сейчас, готовность к распилу потом.** Любой домен должен извлекаться в отдельный сервис без редизайна. Cross-domain связи делаются явными и узкими (`InternalUsersClient` мимикрирует под будущую HTTP-границу). Связность оценивать против этой цели.
- **Overengineering допустим.** Пет-проект без дедлайна: нужен архитектурно чистый код, переживающий распил, а не прагматичные сокращения. Не предлагать «тебе это пока не нужно» — только если абстракция активно вредит (запутывает вместо прояснения).

## Repository layout

Монорепо разделено на самодостаточные части:

- **`backend/`** — FastAPI-сервис (этот пакет `app`, `migrations`, `tests`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Makefile`). Самодостаточный uv-проект: backend-команды (`uv`, `make`, `pytest`) запускаются **из `backend/`**, venv живёт в `backend/.venv`.
- **`frontend/`** — Vite/React SPA (свой `Dockerfile`, build context `./frontend`).
- **`ops/`** — оркестрация и инфра-конфиги: `docker-compose.yaml` (dev), `docker-compose.prod.yaml`, `docker-compose.e2e.yaml`, `Caddyfile` (reverse-proxy + авто-TLS), конфиги логирования (`loki.yaml`, `promtail-config.yml`). Compose запускается через `make`-таргеты (`--project-directory .`), поэтому пути внутри относятся к **корню** репо, а не к `ops/`.
- **Корень** — `.env`/`.env.example`, `Makefile`-оркестратор, `docs/`. Весь стек поднимается одной командой (`make run`).

## Commands

```bash
# Full stack — из корня репозитория
docker network create mindtrace-network   # один раз, перед первым up
make run                                    # dev-стек: app + worker + postgres + frontend + logging
                                            # (обёртка над docker compose -f ops/docker-compose.yaml с --project-directory .)

# Root Makefile-оркестратор — из корня (делегирует в backend/ и frontend/ через make -C,
# под-Makefile'ы не дублируются; удобно не переключать директории)
make be-<target>                           # любой backend-таргет (make be-lint, be-format)
make fe-<target>                           # любой frontend-таргет (make fe-lint, fe-check)
make check                                 # полный гейт обеих сторон (lint + typecheck + тесты unit+api/component)
make test                                  # быстрые тесты обеих сторон (test-back + test-front, без Docker)
make test-infra                            # тяжёлые: backend integration + frontend e2e (оба самодостаточны — поднимают свою одноразовую инфру; нужен только Docker-демон)
make test-e2e                              # frontend e2e: сам поднимает одноразовый стек (ops/docker-compose.e2e.yaml), гоняет Playwright, сносит с -v; дев-база не трогается
make test-e2e-dev                          # e2e по УЖЕ поднятому дев-стеку (`make run`) — быстро, но ПИШЕТ В ДЕВ-БАЗУ.
                                           # Сузить: make test-e2e-dev E2E_ARGS="--project=chromium"

# Backend dev — из backend/ (самодостаточный uv-проект)
cd backend
uv sync                                    # установить зависимости в backend/.venv
uv run python -m app                       # запустить приложение локально
make format                                # ruff: автофиксы + формат
make lint                                  # ruff: lint
make typecheck                             # ty: тайпчек
make test                                  # быстрые тесты: unit + api (без Docker)
make coverage                              # те же тесты + покрытие (term-missing)
make test-integration                      # integration (нужен Docker, testcontainers)
uv run pytest tests/path/test_file.py      # один тест-файл
uv run pytest -k "test_name"               # один тест по имени

# Frontend dev — из frontend/ (Makefile зеркалит backend-нейминг для quality/test-таргетов)
cd frontend
npm install                                # установить зависимости (node_modules)
npm run dev                                # Vite dev-сервер
make lint                                  # oxlint
make lint-fix                              # oxlint --fix (форматтера/prettier в проекте нет)
make typecheck                             # tsc -b
make test                                  # vitest run (один прогон)
make coverage                              # vitest run --coverage
make check                                 # lint + typecheck + audit + test (CI-стиль; тот же таргет гоняет CI)

# Контракт API: бэк → backend/openapi.json → frontend/src/api/generated/ (оба коммитятся)
make be-openapi-dump                       # схема приложения изменилась → перезаписать openapi.json
make fe-generate-api                       # затем перегенерировать SDK (@hey-api/openapi-ts)

# Database migrations — из backend/, против запущенного контейнера
make migrate-create "description"          # создать миграцию (autogenerate)
make migrate-upgrade                       # применить миграции
make migrate-downgrade                     # откатить одну
make migrate-history                       # история миграций

# Доступ к ДЕВ-базе (для EXPLAIN, инспекции схемы). Прода на этом хосте нет.
# POSTGRES_HOST=mindtrace_pg работает только ВНУТРИ docker-сети; с хоста порт проброшен на 5439.
docker compose exec postgres psql -U mindtrace -d mindtrace   # изнутри контейнера (проще всего)
psql -h localhost -p 5439 -U mindtrace -d mindtrace           # с хоста

# SQL миграции без применения — для проверки блокировок
cd backend && uv run alembic upgrade <base>:<head> --sql
```

## Architecture

DDD с **доменной** организацией модулей (`auth`, `users`, `geo`), каждый домен — четыре слоя
`domain/` / `application/` / `infra/` / `presentation/`. Слои, порты (DIP), транзакционная
граница UoW и правила именования вынесены в **@~/.claude/rules/python/ddd.md**, конвенции
переноса данных между слоями (pydantic vs dataclass, `*Command`/`*Result`/`*Request`/`*Response`,
где валидация, кто маппит) — в **@~/.claude/rules/python/dto.md**. Оба подключены в конце этого
файла и являются источником истины по своим темам. Ниже — только то, что специфично для MindTrace.

Технологическая привязка слоёв: `infra/` — SQLAlchemy-модели, `presentation/` — FastAPI-роуты.

### Shared infrastructure (`app/shared/`)

`app/shared/` нарезан **по вертикалям**: каждая техническая интеграция — самодостаточный пакет со всем своим кодом (component lifecycle + клиенты + протоколы + helpers).

- **DI-каркас** (`infra/di/`) — `BaseComponent` и `ComponentRegistry`. Компоненты реализуют `startup(registry)`/`shutdown()` lifecycle, registry attached к `BFastAPI`. Импорт: `from app.shared.infra.di.registry import ComponentRegistry`.
- **postgres** (`infra/postgres/`) — `SqlAlchemyComponent`+`SessionMaker`, `BaseUnitOfWork` (async ctx-mgr транзакции, ручной commit), `db_session_dependency`. Импорты: `from app.shared.infra.postgres.uow import BaseUnitOfWork`, `from app.shared.infra.postgres.dependency import db_session_dependency`.
- **procrastinate** (`infra/procrastinate/`) — `ProcrastinateComponent`+`ProcrastinateApp`, Protocol'ы `TaskBusPort`+`SessionBoundTaskBusPort` с реализацией `ProcrastinateTaskBus`+`ProcrastinateSessionBoundTaskBus` (вертикаль владеет своими протоколами, как `crypto`; фасад для defer'а: `TaskBusPort` без сессии для fire-and-forget, `bus.bind_to(uow.session)` — atomic defer в текущей SA-транзакции), `TaskBusComponent` (регистрирует impl под ключом `ProcrastinateTaskBus`). Application зависит от Protocol'а `TaskBusPort`. Импорт: `from app.shared.infra.procrastinate import TaskBusPort`.
- **email** (`infra/email/`) — `EmailTransportPort` Protocol, `ResendClient`, `ResendComponent`, `EmailMessage`. Импорт: `from app.shared.infra.email import EmailTransportPort`.
- **http** (`infra/http/`) — `BaseHTTPClient` (используют клиенты-наследники), `HTTPClientConfig`, `ExternalAPI*Error`. Импорт: `from app.shared.infra.http import BaseHTTPClient`.
- **jwt** (`infra/jwt/`) — `JWTService` + `JWTDecodeError`, а также request-аутентификация: `current_user_id_dependency` (Bearer → UUID) + `InvalidAccessTokenError` (код `auth.invalid_access_token` сохранён как внешний контракт). Вертикаль shared, чтобы presentation-слои доменов не зависели от `auth.presentation`. Импорт: `from app.shared.infra.jwt import JWTService, current_user_id_dependency`.
- **crypto** (`infra/crypto/`) — два независимых Protocol'а: `SaltedHasherPort` (с реализацией `Argon2SaltedHasher` — для паролей и других плейнтекст-секретов, где требуется уникальная соль и timing-safe verify) и `DeterministicHasherPort` (с реализацией `Sha256DeterministicHasher` — для refresh-token lookup'а по индексу). Импорт: `from app.shared.infra.crypto import SaltedHasherPort, Argon2SaltedHasher, DeterministicHasherPort, Sha256DeterministicHasher`.
- **logging** (`logging/`) — `configure_logging`, `get_logger`, `HTTPLoggingMiddleware` + helper-модули (`events`, `classify`, `context`). Импорт: `from app.shared.logging import get_logger`.
- **BaseDBRepository[ModelT]** (`repositories/base_repository.py`) — generic async repository с `_fetch_one` (выполнить SELECT и вернуть одну модель или `None`) и `insert` (добавить модель в сессию без коммита). Доменные репозитории наследуются и добавляют собственные SELECT'ы поверх `_fetch_one`.
- **Exception hierarchy** (`exceptions/`) — `BaseDomainError` базовый класс. Исключения **транспортно-нейтральны**: НЕ несут HTTP-статус, а классифицируются нейтральной `ErrorCategory` (`INVALID_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, ...). Базовые подклассы (`InvalidInputError`, `UnauthenticatedError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `GoneError`, `UnprocessableError`, `RateLimitedError`, `InternalError`) задают `category` + дефолтный `code`/`message`. Перевод категории в HTTP-статус живёт единственным маппингом `resolve_http_status` в HTTP-адаптере (`mappings.py`), его переиспользуют и handler, и логирование; для другого транспорта (gRPC) заводится отдельный адаптер, домен не трогается. `code` — стабильный машинный идентификатор и часть внешнего API-контракта (фронт мапит его в текст). Global handler в `handlers.py` конвертирует доменные исключения в `ErrorResponse`.
- **Settings** (`settings.py`) — pydantic-settings loading из `.env`, frozen model. Доступ через cached `settings` singleton.

#### Component+Registry vs `@cache`-factory (когда что)

Критерий выбора и правила composition root — в @~/.claude/rules/python/component-lifecycle.md
(этот проект и есть его reference implementation). Здесь — только распределение:

- **Компоненты** (lifecycle-ресурс): `SqlAlchemyComponent`, `ResendComponent`, `ProcrastinateComponent`, `TaskBusComponent`.
- **`@cache`-фабрики** `get_<name>()` рядом с классом: `get_jwt_service` (`app/shared/infra/jwt/service.py`), `get_argon2_salted_hasher` (`app/shared/infra/crypto/argon2.py`), `Sha256DeterministicHasher`. Presentation-dependency импортирует **фабрику**, а не конструктор.

### Key patterns

- All DB operations are async (psycopg3 async driver — выбран для atomic defer procrastinate в SA-транзакции).
- `Password` — тонкий value object вокруг argon2-хеша (`_hash: str` + `@property hash`). Само хеширование делает `SaltedHasherPort` снаружи (infra-protocol); VO нужен как type-level marker «эта строка — argon2-hash, а не любой str» и чтобы entity не зависел от crypto-protocol'а.
- FastAPI dependencies chain: session -> UnitOfWork -> Service (см. `presentation/dependencies.py` в каждом домене).
- **Транзакционная граница (UoW)** — общее правило в ddd.md; здесь реализация: rollback-by-default async-CM из `BaseUnitOfWork`. Канонический пример владения commit'ом — `AuthService.register` (входная точка коммитит) + `UserService.create_user` (cross-domain участник, пишет в общую request-scoped сессию и НЕ коммитит); Option A, см. memory `project_register_transaction_model`. Cross-domain wiring — через `presentation` другого домена (`user_service_dependency`).
- App factory pattern: `create_app()` в `app/main.py`, invoked by uvicorn with `--factory`.
- Routers mounted at `/v1/{domain}` (e.g., `/v1/auth`).
- **Outbound ports — исключение из ddd.md**: shared cross-cutting инфраструктура (`crypto`, `jwt`, `procrastinate`) порт в `application/ports.py` НЕ заводит — протоколом владеет сама вертикаль в `shared/infra/` (см. Shared infrastructure выше). Правило суффикса `Port` при этом действует и на них.
- **TaskBusPort pattern** для procrastinate: вне tx — `await task_bus.defer(task=...)`; в tx — `async with uow.transaction(): await task_bus.bind_to(uow.session).defer(task=...); await uow.commit()` (один commit фиксирует и pending writes, и procrastinate-job).
- **Composition root** (`app/main.py`) собирает компоненты в порядке зависимостей: postgres → email/resend → procrastinate → task_bus (TaskBusComponent читает ProcrastinateApp из registry).

## Code Style

- Line length: 120
- Quotes: double
- Cyrillic is allowed in strings, comments, and user-facing error messages (RUF001-003 ignored)

### Toolchain

- **ruff** — единый инструмент: lint (`make lint`), format (`make format`), сортировка импортов. Black и isort **не использовать** — их функции полностью покрыты ruff.
- **ty** — тайпчекер (`make typecheck`). Mypy в проекте **не используется**.

### Docstrings

Google-style docstrings written in Russian with `Args:` and `Returns:` sections:

```python
def get_log_level_for_exception(exc: Exception) -> int:
    """
    Определяет уровень логирования на основе типа исключения.

    Args:
        exc: Исключение

    Returns:
        Уровень логирования (logging.ERROR, logging.WARNING и т.д.)
    """
```

### Named arguments

Always pass arguments as keyword arguments:

```python
# correct
Password(hash=user_model.password)
User(id=user_entity.user_id, email=user_entity.email)

# wrong
Password(user_model.password)
User(user_entity.user_id, user_entity.email)
```

### Self return type

Use `Self` from `typing` instead of string literals for return type annotations:

```python
from typing import Self

from pydantic import model_validator

@model_validator(mode="after")
def validate_terms(self) -> Self:
    ...
```

### Blank lines after blocks

Add a blank line after closing an `if` block or `for` loop before the next statement:

```python
if exc.category is ErrorCategory.INTERNAL:
    return logging.ERROR

# Ищем подходящий обработчик
for handler in registered_handlers:
    if handler.can_handle(exc):
        return handler

# Фоллбэк по умолчанию
return default_handler
```

## Git

### Branch naming

Ветки называются `<type>/<kebab-описание>`: тип — из того же набора, что и у коммитов (см. ниже), описание — короткий kebab-case суть-изменения. Ticket ID / номера задач **не используются**.

Examples:

- `feat/app-global-globe`
- `fix/gitpython-advisory`
- `perf/globe-webp-textures`
- `chore/backend-consistency`

### Commit message format

Conventional Commits: `<type>(<scope>): <description>`. `scope` **опционален** и обозначает область монорепо (`frontend` / `backend`); для repo-уровневых изменений (тулинг, CI, dependabot) scope опускается. Ticket ID в scope **не используется**.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:

- `feat(frontend): add app-global globe background`
- `fix(backend): закрыть уязвимости в транзитивном gitpython`
- `refactor(backend): extract password hashing into value object`
- `chore: bump the npm-minor-patch group`

### Versioning & changelog

Фронт и бэк версионируются **раздельно** — это разные артефакты с разной семантикой:

- **Backend** — версия в `backend/pyproject.toml`, реальный SemVer по контракту HTTP-API и машинным кодам ошибок (`code`). Бамп бэка тянет за собой `backend/uv.lock`, если менялись зависимости. Теги — `backend-vX.Y.Z`.
- **Frontend** — версия в `frontend/package.json`, маркер релиза SPA (внешнего контракта нет, SemVer формален). Теги — `frontend-vX.Y.Z`.

Не бампать версию одного артефакта на изменения другого: чисто фронтовая фича не трогает `pyproject`, чисто бэковая — не трогает `package.json`.

CHANGELOG — **один** файл в корне. Новые записи группируются по дате с под-секциями `### Backend X.Y.Z` / `### Frontend X.Y.Z` (repo-уровневые изменения — структура, тулинг, CI — идут под `### Project` без номера версии). Разбивать на `backend/CHANGELOG.md` + `frontend/CHANGELOG.md` — только когда каденс релизов реально разъедется.

Правило коммита фичи (по области) — версию и CHANGELOG коммить **тем же коммитом**, что и саму фичу (вместе с её кодом и тестами), отдельный коммит под них не нужен:

- бэк-фича → `backend/pyproject.toml` (+ `backend/uv.lock` при смене зависимостей) + секция Backend в `CHANGELOG.md`;
- фронт-фича → `frontend/package.json` + секция Frontend в `CHANGELOG.md`;
- сквозная → оба файла версий + обе секции.

### Coverage gate (merge)

Код с покрытием **< 90%** мержить нельзя — на обеих сторонах. Порог задан в самих coverage-таргетах: backend `make coverage` (`--cov-fail-under=90`), frontend `make coverage` (vitest `thresholds` в `vite.config.ts`). Форсится **локальным pre-commit hook'ом** (`.githooks/pre-commit`), а не CI: перед каждым commit гоняет coverage обеих сторон и роняет commit при провале порога.

Активация разовая: `make hooks` (== `git config core.hooksPath .githooks`). Обход в исключительном случае — `git commit --no-verify`.

### Codegen drift gate

Контракт фронта генерируется из OpenAPI, поэтому в гите лежат два производных артефакта:
`backend/openapi.json` и `frontend/src/api/generated/`. Устареть они могут независимо, и на
каждый есть свой гейт:

- **бэк** — снапшот-тест `tests/api/test_openapi_schema.py`, входит в `make check`/`check-ci`;
- **фронт** — шаг CI: `make generate-api` + `git diff --exit-code`.

Красный гейт чинится не правкой артефакта руками, а пересборкой: `make be-openapi-dump`, затем
`make fe-generate-api`, оба результата в тот же коммит.

**PR'ы от dependabot этого сделать не могут.** Бамп fastapi/pydantic меняет рендер схемы, бамп
`@hey-api/openapi-ts` — вывод генератора; в обоих случаях гейт краснеет на ветке бота, и
пересборку делает человек, дописывая коммит в его ветку.

Генератор запинен **точной** версией: `@hey-api/openapi-ts` пре-1.0, минорные релизы меняют
вывод. Пин на предрелизной ветке (`0.0.0-next-*`) — вынужденный: стабильная линия падает на
TypeScript 7 (`ts.SyntaxKind` отсутствует в нативном компиляторе), предрелизная не зависит от
compiler API вовсе. Снять, когда TS 7 поедет в стабильном релизе.

Оттуда же `overrides` на `js-yaml` в `frontend/package.json`: парсер схемы у предрелиза тянет
версию из уязвимого диапазона, и `make check` краснеет на `npm audit`. Override поднимает
только этот транзитивный пакет; снимается вместе с пином.

## Always-follow rules

Общие правила инженерии (применяются ко всему репозиторию):

@.claude/rules/common/security.md
@.claude/rules/common/coding-style.md

Python (бэкенд `app/`, `tests/`, `migrations/`):

@.claude/rules/python/security.md
@.claude/rules/python/testing.md

DDD-конвенции (слои, порты, UoW, именование), перенос данных между слоями (DTO) и composition
root (выбор component/`@cache`, порядок старта) — **личные файлы вне репозитория**,
переиспользуются другими проектами:

@~/.claude/rules/python/ddd.md
@~/.claude/rules/python/dto.md
@~/.claude/rules/python/component-lifecycle.md

TypeScript / React (фронтенд `frontend/src/`):

@.claude/rules/typescript/coding-style.md
@.claude/rules/typescript/testing.md

Веб-специфика (UI, performance):

@.claude/rules/web/performance.md

> **Приоритет при конфликтах:** правила, описанные выше в этом файле (Code Style, Docstrings, Named arguments, Shared infrastructure), всегда побеждают над подключёнными rules. Подключённые rules — базовый каркас; конкретика проекта в первой части CLAUDE.md является источником истины.
>
> **Файлы из `~/.claude/rules/`** (`ddd.md`, `dto.md`, `component-lifecycle.md`) живут вне репозитория, поэтому у клонировавшего репо они не разрешатся: в CLAUDE.md останутся ссылки на файлы, которых у него нет. Конвенции при этом видны по коду и по `.claude/rules/python/testing.md`.

## Available toolkit

- **Команды:** проектных нет. `/feature-plan` (пофазный план с чекпоинтами и state-файлом `.claude/.current-plan.md`) живёт глобально в `~/.claude/skills/`; политику версионирования и CHANGELOG он берёт из секции «Versioning & changelog» выше.
- **Кастомные скиллы проекта:** `backend-tests` (unit-тесты бэкенда), `seo-meta-tags` (head-теги для `index.html`), `style-audit` (аудит дизайн-токенов фронтенда)
- **Агенты:** проектных нет. `architecture-reviewer` (глубокий аудит архитектуры, read-only) живёт глобально в `~/.claude/agents/` и доступен во всех проектах; политику, по которой он судит этот проект, он берёт из секции «Архитектурная политика» выше.

Ревью кода — встроенными командами: `/code-review` (баги в текущем диффе) и `/security-review`
(уязвимости). Кастомные ревьюеры удалены: механику ловят `make lint` / `make typecheck`,
а дублирующие агент-файлы устаревали незамеченными.

### Поиск мёртвого кода

```bash
cd backend && uv run vulture app/ vulture_whitelist.py   # unused функции/классы (min_confidence=60)
cd backend && uv run ruff check . --select F401,ERA      # unused импорты + закомментированный код
cd frontend && npx knip                                  # unused файлы, экспорты, зависимости
cd frontend && npx ts-prune                              # unused TS-экспорты
cd frontend && npx depcheck                              # unused npm-зависимости
```

Ложные срабатывания vulture (динамические импорты, FastAPI-роуты) — в `vulture_whitelist.py`,
не понижением `min_confidence`. Удалять батчами: сначала зависимости, потом экспорты, потом
файлы; после каждого батча — тесты и коммит.
