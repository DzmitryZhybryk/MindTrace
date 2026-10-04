---
paths:
  - "backend/app/**"
  - "backend/tach.toml"
---

# Backend shared infrastructure (`backend/app/shared/`)

`shared/` is sliced by **vertical**: each technical integration is a self-contained package with its
component lifecycle, clients, protocols and helpers. Layer rules — `ddd.md`; the choice between a
component and a `@cache` factory — `component-lifecycle.md`. This file is the catalogue and the
import paths.

| Vertical | What it holds | Import |
|---|---|---|
| `infra/di/` | `BaseComponent`, `ComponentRegistry` (`startup(registry)` / `shutdown()`, registry attached to `BFastAPI`) | `from app.shared.infra.di.registry import ComponentRegistry` |
| `infra/postgres/` | `SqlAlchemyComponent`, `SessionMaker`, `BaseUnitOfWork` (async CM, manual commit), `db_session_dependency` | `…postgres.uow import BaseUnitOfWork`, `…postgres.dependency import db_session_dependency` |
| `infra/procrastinate/` | `ProcrastinateComponent`, `ProcrastinateApp`, `TaskBusPort` + `SessionBoundTaskBusPort` with their implementations, `TaskBusComponent` | `from app.shared.infra.procrastinate import TaskBusPort` |
| `infra/email/` | `EmailTransportPort`, `ResendClient`, `ResendComponent`, `EmailMessage` | `from app.shared.infra.email import EmailTransportPort` |
| `infra/http/` | `BaseHTTPClient` (parent of client classes), `HTTPClientConfig`, `ExternalAPI*Error` | `from app.shared.infra.http import BaseHTTPClient` |
| `infra/jwt/` | `JWTService`, `JWTDecodeError`, request auth `current_user_id_dependency` (Bearer → UUID), `InvalidAccessTokenError` (code `auth.invalid_access_token` is an external contract) | `from app.shared.infra.jwt import JWTService, current_user_id_dependency` |
| `infra/crypto/` | two independent ports: `SaltedHasherPort` (`Argon2SaltedHasher`: passwords, unique salt, timing-safe verify) and `DeterministicHasherPort` (`Sha256DeterministicHasher`: refresh-token lookup by index) | `from app.shared.infra.crypto import SaltedHasherPort, Argon2SaltedHasher, DeterministicHasherPort, Sha256DeterministicHasher` |
| `logging/` | `configure_logging`, `get_logger`, `HTTPLoggingMiddleware` + `events` / `classify` / `context` | `from app.shared.logging import get_logger` |
| `pagination/` | keyset pagination: `CursorPageRequest` / `CursorPageResponse[ItemT]` at HTTP, `PageQuery` / `CursorPage[ItemT]` in application, `encode_cursor` / `decode_cursor` / `split_page` for repositories; a bad cursor → `InvalidCursorError` (code `invalid_cursor`) | `from app.shared.pagination import CursorPageRequest, PageQuery, split_page` |
| `fractional_index/` | manual row order by a fractional key: `generate_key_between`, `SortKeyModel`, `SortKeyRepositoryPort[ScopeT]`, `BaseSortKeyRepository[ModelT, ScopeT]`. A domain supplies only the scope (a frozen dataclass such as `JourneyOrderScope` + a `_sort_key_scope` hook); the model declares its own unique index over scope + `sort_key` | `from app.shared.fractional_index import generate_key_between, BaseSortKeyRepository` |
| `repositories/base_repository.py` | `BaseDBRepository[ModelT]` with `_fetch_one` (SELECT → one model or `None`) and `insert` (add to the session, no commit); domain repositories subclass it | |
| `exceptions/` | see below | |
| `settings.py` | pydantic-settings from `.env`, frozen model, cached `settings` singleton | |

A vertical owns its protocols: `crypto`, `jwt`, `procrastinate` do **not** declare their port in a
domain's `application/ports.py` (an exception to `ddd.md`). The `Port` suffix rule still applies.

## Exceptions

`BaseDomainError` is the base. Exceptions are **transport-neutral**: they carry no HTTP status and
are classified by a neutral `ErrorCategory` (`INVALID_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, …).
The base subclasses (`InvalidInputError`, `UnauthenticatedError`, `PermissionDeniedError`,
`NotFoundError`, `ConflictError`, `GoneError`, `UnprocessableError`, `RateLimitedError`,
`InternalError`) set the `category` and a default `code` / `message`.

- The category → HTTP status mapping lives once, in `resolve_http_status` (HTTP adapter,
  `mappings.py`), reused by the handler and by logging. Another transport (gRPC) gets its own
  adapter; the domain is untouched.
- `code` is a stable machine identifier and part of the external API contract: the frontend maps it
  to text. Never rename one casually.
- The global handler in `handlers.py` turns domain exceptions into `ErrorResponse`.

## Component or `@cache` factory

The criterion is in `component-lifecycle.md`. Current split:

- Components (own a resource): `SqlAlchemyComponent`, `ResendComponent`, `ProcrastinateComponent`, `TaskBusComponent`.
- `@cache` factories `get_<name>()` next to the class: `get_jwt_service` (`app/shared/infra/jwt/service.py`),
  `get_argon2_salted_hasher` (`app/shared/infra/crypto/argon2.py`), `Sha256DeterministicHasher`.
  A presentation dependency imports the **factory**, not the constructor.

## Patterns

- All DB work is async (psycopg3 async driver, chosen for atomic procrastinate defer inside the SA transaction).
- Dependency chain in each domain's `presentation/dependencies.py`: session → UnitOfWork → Service.
- `create_app()` in `app/main.py` is the app factory (uvicorn `--factory`); routers mount at `/v1/{domain}`.
- **Composition root** (`app/main.py`) builds components in dependency order:
  postgres → email/resend → procrastinate → task_bus (`TaskBusComponent` reads `ProcrastinateApp` from the registry).
- **Transaction ownership.** The entry point commits (`AuthService.register`); a cross-domain
  participant (`UserService.create_user`) writes to the shared request-scoped session and does not
  commit. Cross-domain wiring goes through the other domain's `presentation`
  (`user_service_dependency`). Register is a synchronous atomic transaction, not a procrastinate/saga
  step, while there is one database.
- **`TaskBusPort`.** Outside a transaction: `await task_bus.defer(task=...)`. Inside one:
  `async with uow.transaction(): await task_bus.bind_to(uow.session).defer(task=...); await uow.commit()`
  — one commit fixes both the pending writes and the procrastinate job.
- `Password` is a thin value object over an argon2 hash. Hashing itself is done by `SaltedHasherPort`
  from outside; the VO is a type-level marker that the string is an argon2 hash and keeps the entity
  independent of the crypto protocol.
