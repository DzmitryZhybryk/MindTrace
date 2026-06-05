# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MindTrace is a FastAPI service (Python 3.14+, async) using Domain-Driven Design. Package manager is **uv**. Database is PostgreSQL via SQLAlchemy async + SQLModel. Runs in Docker with a Loki/Promtail/Grafana logging stack.

## Repository layout

Монорепо разделено на самодостаточные части:

- **`backend/`** — FastAPI-сервис (этот пакет `app`, `migrations`, `tests`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Makefile`). Самодостаточный uv-проект: backend-команды (`uv`, `make`, `pytest`) запускаются **из `backend/`**, venv живёт в `backend/.venv`.
- **`frontend/`** — Vite/React SPA (свой `Dockerfile`, build context `./frontend`).
- **Корень** — оркестрация и инфраструктура: `docker-compose.yaml`, `.env`, конфиги логирования (`loki.yaml`, `promtail-config.yml`), `docs/`. Весь стек поднимается отсюда одной командой.

## Commands

```bash
# Full stack — из корня репозитория
docker network create mindtrace-network   # один раз, перед первым up
docker compose up -d                       # app + worker + postgres + frontend + logging

# Backend dev — из backend/ (самодостаточный uv-проект)
cd backend
uv sync                                    # установить зависимости в backend/.venv
uv run python -m app                       # запустить приложение локально
make format                                # ruff: автофиксы + формат
make lint                                  # ruff: lint
make typecheck                             # ty: тайпчек
uv run pytest                              # все тесты (asyncio_mode=auto)
uv run pytest tests/path/test_file.py      # один тест-файл
uv run pytest -k "test_name"               # один тест по имени

# Database migrations — из backend/, против запущенного контейнера
make migrate-create "description"          # создать миграцию (autogenerate)
make migrate-upgrade                       # применить миграции
make migrate-downgrade                     # откатить одну
make migrate-history                       # история миграций
```

## Architecture

The project follows DDD with **domain-based** module organization. Each domain (users, auth) is self-contained with four layers:

- **domain/** -- Pure business logic: entities, value objects. No infrastructure imports.
- **infra/** -- SQLModel DB models, repository implementations, UnitOfWork.
- **application/** -- Use cases/services and DTOs for business operations.
- **presentation/** -- FastAPI routes, HTTP request/response schemas, dependencies.

Presentation schemas are separate from application DTOs to prevent abstraction leakage. Conversion happens in the presentation layer.

### Shared infrastructure (`app/shared/`)

`app/shared/` нарезан **по вертикалям**: каждая техническая интеграция — самодостаточный пакет со всем своим кодом (component lifecycle + клиенты + протоколы + helpers).

- **DI-каркас** (`infra/di/`) — `BaseComponent` и `ComponentRegistry`. Компоненты реализуют `startup(registry)`/`shutdown()` lifecycle, registry attached к `BFastAPI`. Импорт: `from app.shared.infra.di.registry import ComponentRegistry`.
- **postgres** (`infra/postgres/`) — `SqlAlchemyComponent`+`SessionMaker`, `BaseUnitOfWork` (async ctx-mgr транзакции, ручной commit), `db_session_dependency`. Импорты: `from app.shared.infra.postgres.uow import BaseUnitOfWork`, `from app.shared.infra.postgres.dependency import db_session_dependency`.
- **procrastinate** (`infra/procrastinate/`) — `ProcrastinateComponent`+`ProcrastinateApp`, `TaskBus`+`SessionBoundTaskBus` (фасад для defer'а: `TaskBus` без сессии для fire-and-forget, `bus.bind_to(uow.session)` — atomic defer в текущей SA-транзакции), `TaskBusComponent`. Импорт: `from app.shared.infra.procrastinate import TaskBus`.
- **email** (`infra/email/`) — `EmailTransport` Protocol, `ResendClient`, `ResendComponent`, `EmailMessage`. Импорт: `from app.shared.infra.email import EmailTransport`.
- **http** (`infra/http/`) — `BaseHTTPClient` (используют клиенты-наследники), `HTTPClientConfig`, `ExternalAPI*Error`. Импорт: `from app.shared.infra.http import BaseHTTPClient`.
- **jwt** (`infra/jwt/`) — `JWTService` + `JWTDecodeError`. Импорт: `from app.shared.infra.jwt import JWTService`.
- **crypto** (`infra/crypto/`) — два независимых Protocol'а: `SaltedHasher` (с реализацией `Argon2SaltedHasher` — для паролей и других плейнтекст-секретов, где требуется уникальная соль и timing-safe verify) и `DeterministicHasher` (с реализацией `Sha256DeterministicHasher` — для refresh-token lookup'а по индексу). Импорт: `from app.shared.infra.crypto import SaltedHasher, Argon2SaltedHasher, DeterministicHasher, Sha256DeterministicHasher`.
- **logging** (`logging/`) — `configure_logging`, `get_logger`, `HTTPLoggingMiddleware` + helper-модули (`events`, `classify`, `context`). Импорт: `from app.shared.logging import get_logger`.
- **BaseDBRepository[ModelT]** (`repositories/base_repository.py`) — generic async repository с `_fetch_one` (выполнить SELECT и вернуть одну модель или `None`) и `insert` (добавить модель в сессию без коммита). Доменные репозитории наследуются и добавляют собственные SELECT'ы поверх `_fetch_one`.
- **Exception hierarchy** (`exceptions/`) — `BaseDomainError` базовый класс. Исключения **транспортно-нейтральны**: НЕ несут HTTP-статус, а классифицируются нейтральной `ErrorCategory` (`INVALID_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, ...). Базовые подклассы (`InvalidInputError`, `UnauthenticatedError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `GoneError`, `UnprocessableError`, `RateLimitedError`, `InternalError`) задают `category` + дефолтный `code`/`message`. Перевод категории в HTTP-статус живёт единственным маппингом `resolve_http_status` в HTTP-адаптере (`mappings.py`), его переиспользуют и handler, и логирование; для другого транспорта (gRPC) заводится отдельный адаптер, домен не трогается. `code` — стабильный машинный идентификатор и часть внешнего API-контракта (фронт мапит его в текст). Global handler в `handlers.py` конвертирует доменные исключения в `ErrorResponse`.
- **Settings** (`settings.py`) — pydantic-settings loading из `.env`, frozen model. Доступ через cached `settings` singleton.

#### Component+Registry vs `@cache`-factory (когда что)

Инфраструктура **с lifecycle-ресурсом** (PG-пул, httpx-пул, procrastinate-app, smtp-соединение) — `BaseComponent` + регистрация в `ComponentRegistry`. Composition root собирает компоненты в порядке зависимостей и вызывает `startup`/`shutdown`. Пример: `SqlAlchemyComponent`, `ResendComponent`, `ProcrastinateComponent`, `TaskBusComponent`.

Stateless infra **без сетевого ресурса** (`JWTService`, `Argon2SaltedHasher`, `Sha256DeterministicHasher`) — `@cache`-factory `get_<name>()` рядом с классом в том же модуле (см. `app/shared/infra/jwt/service.py`, `app/shared/infra/crypto/argon2.py`). Component тут не нужен — нечего startup'ить и нечего shutdown'ить, но singleton всё равно полезен: hasher'ы и `JWTService` thread-safe и пересоздавать их на каждый запрос бессмысленно. Presentation-dependency импортирует **factory**, а не конструктор — это снимает дубли инстансов на запрос и даёт единое место для override в тестах.

### Key patterns

- All DB operations are async (psycopg3 async driver — выбран для atomic defer procrastinate в SA-транзакции).
- `Password` — тонкий value object вокруг argon2-хеша (`_hash: str` + `@property hash`). Само хеширование делает `SaltedHasher` снаружи (infra-protocol); VO нужен как type-level marker «эта строка — argon2-hash, а не любой str» и чтобы entity не зависел от crypto-protocol'а.
- FastAPI dependencies chain: session -> UnitOfWork -> Service (см. `presentation/dependencies.py` в каждом домене).
- App factory pattern: `create_app()` в `app/main.py`, invoked by uvicorn with `--factory`.
- Routers mounted at `/v1/{domain}` (e.g., `/v1/auth`).
- **TaskBus pattern** для procrastinate: вне tx — `await task_bus.defer(task=...)`; в tx — `await task_bus.bind_to(uow.session).defer(task=...)` + `await uow.commit()` (один commit фиксирует и pending writes, и procrastinate-job).
- **Composition root** (`app/main.py`) собирает компоненты в порядке зависимостей: postgres → email/resend → procrastinate → task_bus (TaskBusComponent читает ProcrastinateApp из registry).

### DTO conventions: pydantic vs dataclass

Application и infra-слои оперируют разными типами транспортных объектов. Чтобы выбор между `pydantic.BaseModel` и `@dataclass` не зависел от настроения автора, действует одно правило:

> **Pydantic используется только тогда, когда есть что валидировать или нести семантически.** Во всех остальных случаях транспортный объект — `@dataclass(frozen=True, slots=True)`.

Что считается «есть что валидировать или нести семантически»:

- семантические типы (`EmailStr`, `SecretStr`, `HttpUrl`, кастомные validators);
- парсинг из недоверенного источника (HTTP body, внешний API, очередь) — pydantic выступает границей валидации;
- участие схемы в OpenAPI (FastAPI `response_model`, request body) — нужен JSON Schema.

Если ничего из этого нет, транспортный объект — `dataclass`. Конверсия в pydantic-схему на границе HTTP остаётся однострочной: `Schema.model_validate(obj, from_attributes=True)` работает с любым объектом по `getattr`.

Это правило действует **только для транспортных объектов** (DTO между слоями, Result сервисов, входные контракты infra-клиентов). Не применять к:

- **HTTP request/response (presentation)** — всегда pydantic, это граница системы.
- **Domain entities** — не dataclass и не pydantic. Entity несёт поведение и инкапсуляцию (приватные поля + `@property`), это не транспортный тип.
- **Value objects** — обычные классы с инвариантами в конструкторе.

### Service Result convention

Сервисы (application-слой) возвращают результаты use case'а как именованные объекты с суффиксом `*Result`. Это стабильная точка между application и presentation: presentation конвертирует `*Result` в HTTP-ответ, никогда не возвращает entity или value object наружу.

Тип `*Result` выбирается по правилу выше: dataclass по умолчанию, pydantic — если внутри есть семантические типы или валидация. Допустимо иметь в одном проекте часть `*Result` как dataclass, часть как pydantic — это не несогласованность, а осмысленная разметка по правилу.

### Service Command convention

Симметрично выходу: входной DTO use case'а (то, что route передаёт в сервис) именуется с суффиксом `*Command`, если это **намерение пользователя** на конкретный сценарий. Каноничный CQRS-стиль `<Verb><Noun>Command` предпочтительнее: `CreateUserCommand`, `RegistrationCommand`, `VerifyEmailCommand`. Это убирает двусмысленность с domain entity (`Registration` звучит как сущность, `RegistrationCommand` — нет) и даёт симметрию `*Command` → service → `*Result`.

Исключение: ambient-метадата запроса (IP, user-agent, транспортные идентификаторы вызывающего) — это **не** Command. Такие объекты именуются `*Metadata` / `*Context` без суффикса `Command` (например, `ClientMetadata`).

Конверсия presentation-схемы (`*Request`) в `*Command` живёт в route одной строкой: `RegistrationCommand.model_validate(body, from_attributes=True)`.

### Infra-clients: `*Request` / `*Response`

Контракты с внешним сервисом (модули `infra/clients/<service>_client.py`) именуются `<Verb><Noun>Request` / `<Verb><Noun>Response`. Это совпадает с конвенциями OpenAPI codegen, gRPC, AWS SDK — любой Python-разработчик читает `CreateUserRequest` в `infra/clients/` сразу как «контракт исходящего вызова».

Совпадение суффикса с `presentation/schemas.py` намеренное: **слой задаёт направление**.

| Слой | Что значит `*Request` | Что значит `*Response` |
|---|---|---|
| `presentation/schemas.py` | приходит **к нам** (HTTP body) | мы **возвращаем** (HTTP response) |
| `infra/clients/*.py` | мы **отправляем** во внешний сервис | приходит **нам** в ответ |

Двусмысленности нет, потому что путь импорта однозначно указывает роль (`from app.auth.presentation.schemas import RegisterRequest` vs `from app.auth.infra.clients.internal_users_client import CreateUserRequest`).

### Cводная таблица именования по слоям

| Слой | Вход | Выход |
|---|---|---|
| `presentation/schemas.py` (HTTP-граница нашего сервиса) | `*Request` | `*Response` |
| `application/schemas.py` (use case'ы) | `*Command` (или `*Metadata`/`*Context` для ambient) | `*Result` |
| `infra/clients/*.py` (исходящие вызовы внешних сервисов) | `*Request` | `*Response` |
| `domain/entities/*.py`, `domain/value_objects.py` | без суффиксов | без суффиксов |

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
Password.from_hash(existing_hash=user_model.password)
User(id=user_entity.user_id, email=user_entity.email)

# wrong
Password.from_hash(user_model.password)
User(user_entity.user_id, user_entity.email)
```

### Self return type

Use `Self` from `typing` instead of string literals for return type annotations:

```python
from typing import Self

@classmethod
def from_hash(cls, existing_hash: str) -> Self:
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

### Commit message format

Conventional Commits со scope из ticket ID:

`<type>(<DEV-XXX>): <description>`

Где `DEV-XXX` — номер задачи из имени ветки (`DEV-123/create_user` → `DEV-123`).

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:

- `feat(DEV-18): add email verification endpoint`
- `chore(DEV-16): bump fastapi to 0.115`
- `refactor(DEV-123): extract password hashing into value object`

### Versioning & changelog

Фронт и бэк версионируются **раздельно** — это разные артефакты с разной семантикой:

- **Backend** — версия в `backend/pyproject.toml`, реальный SemVer по контракту HTTP-API и машинным кодам ошибок (`code`). Бамп бэка тянет за собой `backend/uv.lock`, если менялись зависимости. Теги — `backend-vX.Y.Z`.
- **Frontend** — версия в `frontend/package.json`, маркер релиза SPA (внешнего контракта нет, SemVer формален). Теги — `frontend-vX.Y.Z`.

Не бампать версию одного артефакта на изменения другого: чисто фронтовая фича не трогает `pyproject`, чисто бэковая — не трогает `package.json`.

CHANGELOG — **один** файл в корне. Новые записи группируются по дате с под-секциями `### Backend X.Y.Z` / `### Frontend X.Y.Z` (repo-уровневые изменения — структура, тулинг, CI — идут под `### Project` без номера версии). Разбивать на `backend/CHANGELOG.md` + `frontend/CHANGELOG.md` — только когда каденс релизов реально разъедется.

Правило коммита фичи (по области):

- бэк-фича → `backend/pyproject.toml` (+ `backend/uv.lock` при смене зависимостей) + секция Backend в `CHANGELOG.md`, отдельным `docs(DEV-XXX)`-коммитом;
- фронт-фича → `frontend/package.json` + секция Frontend в `CHANGELOG.md`, отдельным `docs`-коммитом;
- сквозная → оба файла версий + обе секции.

## Always-follow rules

Общие правила инженерии (применяются ко всему репозиторию):

@.claude/rules/common/security.md
@.claude/rules/common/coding-style.md

Python (бэкенд `app/`, `tests/`, `migrations/`):

@.claude/rules/python/security.md

TypeScript / React (фронтенд `frontend/src/`):

@.claude/rules/typescript/coding-style.md

Веб-специфика (UI, performance):

@.claude/rules/web/performance.md

> **Приоритет при конфликтах:** правила, описанные выше в этом файле (DTO conventions, Service Result, Code Style, Docstrings, Named arguments), всегда побеждают над общими rules из `.claude/rules/`. Подключённые rules — это базовый каркас; конкретика проекта в первой части CLAUDE.md является источником истины.

## Available toolkit

Скиллы и команды загружены из `extracted-cc-toolkit` (Python+React набор). Полезное:

- **Команды:** `/python-review`, `/plan`
- **Кастомные скиллы проекта:** `seo-meta-tags` (head-теги для `index.html`), `style-audit` (аудит дизайн-токенов фронтенда)
- **Агенты:** `python-reviewer`, `typescript-reviewer`, `database-reviewer`, `build-error-resolver`, `refactor-cleaner`
