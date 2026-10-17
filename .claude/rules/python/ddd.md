---
paths:
  - "backend/app/**"
  - "backend/tests/fakes/**"
---
# DDD conventions for Python services

> Naming and boundary decisions, not a DDD tutorial. Where a project already has its own answer,
> the project wins.

## Layers

Each domain is self-contained:

- **`domain/`** — entities and value objects. Pure business logic, no infrastructure imports
- **`application/`** — use cases (`services/`), their inbound types (`schemas/`), outbound ports
  (`ports/`) and the domain's config type (`config.py`)
- **`infra/`** — ORM models plus the implementations of those ports
- **`presentation/`** — routes, HTTP schemas, dependencies

Inside `application/` each kind of thing has one place, and nothing else sits in the root:

```
application/
├── schemas/            inbound to the use case — split by ROLE
│   ├── commands.py     *Command
│   ├── results.py      *Result and the items nested in them
│   └── metadata.py     *Metadata — only where the domain has one
├── ports/              outbound from the use case — split by PORT
│   ├── <port>.py       one Protocol plus every type it declares
│   ├── tasks.py        names of tasks the domain defers — only where it defers any
│   └── unit_of_work.py only where the domain writes
├── services/           the use cases — split by SERVICE
│   └── <service>.py    one *Service class, or a helper the services compose
└── config.py           *Config — only where the domain has tunables
```

No `__init__.py` re-exports: the import path names the role, the port or the service a type
belongs to (`schemas.commands.CreateJourneyCommand`, `ports.journey_repository.JourneyFilters`,
`services.journey.JourneyService`), and a re-exporting `__init__` is where the next dump forms.
A small domain gets the same packages — one layout everywhere is worth more than one file saved.

- **A service module** is named after its class without the `Service` suffix (`services/journey.py`
  → `JourneyService`), as a port module drops `Port`.
- **A helper that is not a use case** — a collaborator the services share or delegate to
  (`TokenIssuer`) — lives in `services/` beside them, under its own name. Presentation only
  constructs it; it never gets a package of its own. Pure logic with no dependencies goes to
  `shared/utils` instead.
- **Task names** are the contract between the use case that defers a task through the shared task
  bus and the `infra` handler registered under that name — the same `infra → application`
  direction as a port, so they live in `ports/tasks.py`.

Presentation schemas stay separate from application DTOs. What crosses each boundary, how it is
named and where it is converted — `dto.md`.

## Domain config

A service that needs tunables (TTLs, limits, cooldowns) declares them as constructor parameters:
one value — a plain parameter, several — a frozen `*Config` dataclass in `application/config.py`,
fields named without the domain prefix the class name already carries.

**`application` never imports the global settings object.** Mapping global settings onto the
domain's config is wiring: it happens in `presentation/dependencies.py`, next to the other
dependencies, and tests override that dependency. No `@cache` factory beside the config — building
a few scalars per request costs nothing, and a factory in `application` that reads settings is
exactly the import this rule forbids.

## Outbound ports (DIP)

Domain-specific outbound dependencies (repositories, unit of work, clients to other services)
are declared as `Protocol`, **one module per port** under `application/ports/`. `infra` imports
the port and implements it — **`infra → application`, never the reverse**. Services and test
fakes depend on the port.

- The module is named after the port without the `Port` suffix: `refresh_token_repository.py`,
  `users_client.py`. The unit of work drops the domain prefix — `unit_of_work.py`, not
  `auth_unit_of_work.py` — because the package path already carries the domain.
- The module holds the Protocol **and every type the Protocol declares**: its `*Scope`,
  `*Filters`, `*Request` and read models (`dto.md` → "Port parameters"). A reader opening the
  port sees the whole contract. A type two ports of one domain both need lives with the port
  whose method declares it, and the other imports it from there — no `ports/common.py`.
- A port module imports only `domain`, `shared`, sibling ports and third-party types — never
  `schemas/`, `services/` or `infra` (tach enforces the last).

**Every `Protocol` subclass is named with a `Port` suffix** (`SaltedHasherPort`,
`RefreshTokenRepositoryPort`); implementations drop it (`Argon2SaltedHasher`,
`RefreshTokenRepository`). The name alone says whether it is a contract or an implementation.

Give closely-related Protocols **distinct method names**, and say in each docstring that the name
differs on purpose: structural typing has no nominal check, so two ports sharing a signature can be
silently substituted.

## Transaction boundary (UoW)

One use case = one transaction: `async with uow.transaction(): ... await uow.commit()`.
Rollback by default — leaving the block without an explicit commit rolls back.

**The commit belongs to the use case's entry point.** A cross-domain participant writes to the
same request-scoped session and does **not** commit; everything lands in one atomic commit.
Cross-domain wiring goes through the other domain's `presentation`, never its `infra`.

## Soft-delete: read policy

Two-tier convention:

- **Point lookups** (`find_<entity>_by_id`, …) carry **no** SQL predicate on `deleted_at`:
  the repository returns what the store holds, and interpreting deletion is domain work — an
  entity guard (`ensure_not_deleted()`) at the use-case call site, with a use-case-specific
  error (404 vs 410 vs "admin sees everything").
- **List queries** filter `deleted_at IS NULL` **in SQL by default** — fetching deleted rows
  only to drop them in Python is waste. State the filtering in the method's docstring.
- Extend for consumers of deleted rows **on demand, not up front**: a two-state kwarg
  `include_deleted: bool = False` on the method that needs it; "deleted only" — a separate
  method with a qualifier in its name. Never a tri-state `is_deleted: bool | None` — the
  `None` semantics cannot be read at the call site.

## Repository method naming

`<verb>_<entity>[_<qualifier>]` — **the entity always appears in the name**:

```python
insert_challenge(challenge_entity)
find_active_challenge_for_update(user_id, challenge_type)
find_refresh_token_by_hash_for_update(token_hash)
revoke_all_active_refresh_tokens_by_user_id(user_id)   # plural for bulk
```

Not `find_by_hash_for_update(...)` — unqualified, it says nothing about what is being found and
cannot be grepped by entity. The apparent redundancy with the attribute name
(`uow.refresh_token_repository.find_refresh_token_by_hash_for_update`) is intentional: the
call site reads as a whole sentence.

**One exception: a generic port from the shared layer.** When a mechanic is reused across
entities (manual ordering, say), its port is a generic `Protocol` parametrised by a domain type
(`SortKeyRepositoryPort[ScopeT]`), and one base repository implements it for every model. Its
methods are named after the operation (`find_last_sort_key(scope)`), the domain port inherits
them with its own type argument, and the entity is named by that argument — not repeated in a
per-domain wrapper method. Re-declaring the methods with entity names would bring back exactly
the duplication the shared port exists to remove.

## Repository read models

A query that returns a projection for a screen rather than an entity (aggregated or grouped
rows the database computed) returns a **read model**: a frozen dataclass in the port's own
module under `application/ports/`, declared next to the Protocol that returns it and built by
`infra`. Name it for what it is, with no
suffix (`VisitedPlace`), and compose it from domain value objects where one fits.

If a row would equal an item of the use case's `*Result` field for field, the repository
returns that item type itself — a read model identical to the result item is only a place for
the two copies to drift. Keep a separate read model when the service reshapes the rows
(groups, merges, drops fields) before they leave the use case.

## Entity method naming

The entity name appears in a method name only when the receiver is *not* that entity: a method
on the entity is bare (`refresh_token_entity.revoke()`, `UserEntity.create()`), a repository
method carries it. Value objects are assembled in the application service; `Entity.create()`
takes ready-made VOs and mints identity internally.

One exception: a VO that is the use case's own input type (a `*Command` field typed as a domain VO)
is built by the presentation adapter when it maps the request into the command. The command then
carries the domain type instead of a field-by-field twin DTO.

## Variable layer suffixes

One concept exists as several types across layers, often in the same mapper function. Variables
and parameters holding a domain type carry a layer suffix:

- domain entity → `user_entity`, `refresh_token_entity`
- ORM model → `user_model`, `refresh_token_model`
- DTOs are usually unambiguous from their own type suffix; add one only on collision

Applies to locals **and** parameters, including repository/port/fake signatures:
`insert_refresh_token(refresh_token_entity=...)`.

This is a marker for *the layer of a domain concept*, not types-in-names generally — never
`count_int` or `name_str`.
