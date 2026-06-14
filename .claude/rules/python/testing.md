# Python Testing

> Extends [common/coding-style.md](../common/coding-style.md) for the backend test suite (`backend/tests/`).
> This file is the **source of truth** for *how we test the backend*. The `backend-tests`
> skill executes against these rules; `/plan` reads them when planning test work.
> All commands run from `backend/` (self-contained uv project).

## Testing pyramid (what lives where)

Two orthogonal axes: **test type** (speed + dependencies) and **domain/layer** (mirror of `app/`).

| Type | Touches I/O? | What it covers | Run profile |
|---|---|---|---|
| **unit** | No | domain entities/VO, application services (with fakes), pure helpers, crypto/jwt roundtrips | every commit, fast |
| **integration** | Yes (real Postgres) | repositories, UoW, SQL, `FOR UPDATE` locks, unique constraints, migrations | pre-merge / CI |
| **api** | Yes (ASGI app) | routes, wiring, `resolve_http_status`, cookies, error envelope | pre-merge / CI |

The **bulk of value is in `unit/`** (domain + application). Keep integration and api thin.

## Directory layout

Top level by **test type**, then mirror `app/<domain>/<layer>`:

```
backend/tests/
├── conftest.py              # root fixtures (shared fakes/builders wired as fixtures)
├── fakes/                   # reusable in-memory fakes (repos, clients, hashers, task_bus)
├── builders.py              # test-data builders for entities / value objects
├── unit/
│   ├── auth/{domain,application,presentation}/test_*.py
│   ├── users/...
│   └── shared/{infra/crypto,infra/jwt,exceptions}/test_*.py
├── integration/
│   └── auth/infra/test_*_repository.py
└── api/
    └── auth/test_routes.py
```

Markers are **auto-applied from the path** by a `pytest_collection_modifyitems` hook in
`tests/conftest.py` — never hand-tag tests. Two axes: **level** (`unit`/`integration`/`api`) and
**domain** (`auth`/`users`/`shared`), both derived from `tests/<level>/<domain>/...`. They compose:
`-m unit`, `-m users`, `-m "unit and users"` (or `make test-unit` / `make test-users`; for
axis **intersections** run `uv run pytest -m "unit and users"` directly). A new level/domain must be registered in `pyproject.toml`
`markers` **and** added to the conftest tuples (`--strict-markers` rejects unregistered ones).

## Philosophy: classicist + hand-written fakes

- **State-based (classicist), not interaction-based (mockist).** Assert on the resulting
  state/return value, not on call order. Use **real objects where cheap** (domain entities,
  stateless infra: `JWTService`, `TokenIssuer`, real hashers in their own roundtrip test).
- **Fake only the I/O boundary**: repositories, the UoW, external clients (`InternalUsersClient`),
  `TaskBusPort`, email transport.
- **DI is constructor-based** — application services (`AuthService(uow, users_client, salted_hasher,
  token_issuer, email_verification_service)`) are unit-tested by passing fakes **directly**,
  fully bypassing FastAPI. `dependency_overrides` belong to the **api** layer only.

### Fakes over mocks

- **Hand-written in-memory fakes** in `tests/fakes/` (e.g. `FakeRefreshTokenRepository` backed by
  a `dict`). They survive refactors and read like real scenarios (`find` after `insert` returns it).
- A **fake UoW** is a simple object exposing the fake repositories + `commit = AsyncMock()`.
- `AsyncMock` / `MagicMock` are used **only** for side-effect-only collaborators where the test
  verifies the call happened: `users_client.create_user`, `task_bus.defer`,
  `email_verification_service.request_email_verification`, and `uow.commit`.
- **Never mock `AsyncSession` / SQLAlchemy** — that's brittle and worthless. Repositories are
  covered by **integration** tests against a real Postgres.

### Thin Protocols for repositories

To keep fakes honest (and let `ty` catch drift), when writing the first fake for a repository,
introduce a thin `typing.Protocol` declaring **only the methods actually used**, and type both the
real repository and the fake with it. Without it, a fake can silently diverge from the real
signature and the typechecker stays blind.

The port **lives in the application layer** (e.g. `app/<domain>/application/ports.py`), not in
`infra/`. By dependency inversion the contract the services depend on is owned by application; the
`infra` repository **imports the port and implements it** (`infra → application`, never the
reverse), the domain `UnitOfWork` types its repo attributes with the ports, and the fakes implement
the same ports. The port module imports only `domain` (entities/enums) plus stdlib/third-party types
(e.g. `AsyncSession` for the UoW port's atomic-defer seam) — never `app.*.infra` — so it stays a leaf
with no internal import cycle.

## Determinism

- **Time:** prefer **constructing entities with explicit timestamps** (`expires_at` /
  `revoked_at` are constructor args) over freezing the clock. Reach for `time-machine` only for the
  few cases that assert "`revoke()` sets *now*". **Do not** freeze time globally. **Do not** inject a
  `Clock` provider into production code just for tests.
- **Randomness** (`secrets.token_urlsafe`): never predict the value — assert the **invariant**
  (`entity.token_hash == hasher.digest(plaintext)`).
- **Argon2 is deliberately slow (~50ms/hash):** use a `FakeSaltedHasher` (e.g.
  `hash = f"hashed::{secret}"`, `verify = hashed == f"hashed::{secret}"`) in service tests. Cover
  real `Argon2SaltedHasher` once in `unit/shared/infra/crypto/` (hash→verify roundtrip + wrong
  secret fails).

## Test data builders

Plain functions with kwargs defaults in `tests/builders.py` (e.g.
`make_refresh_token(*, expires_at=..., revoked_at=None)`). **No** `factory-boy` / `faker` —
determinism beats realism here.

## Reuse before create (check the suite FIRST)

**Before writing or extending any test — and before adding any fixture / fake / builder / helper a
test needs — first enumerate what already exists and reuse it.** Most duplication bugs here come from
inventing a local `_make_x` helper or a second fixture when the project already ships one (e.g. a
`jwt_service` fixture, a `make_user_credentials` builder, a `FakeSaltedHasher`). A near-duplicate
fixture/fake/builder is the same defect as copy-pasted production code.

One cheap, bounded scan (do **not** re-read the whole suite):

```bash
# every fixture, fake and builder defined across the suite, in one pass
grep -rn "@pytest.fixture" tests
grep -rn "^def make_\|^class Fake" tests/builders.py tests/fakes
```

Read only the definitions that match what you need; then reuse them by name.

- **No local test-data helpers.** Don't add a `_make_command` / `_make_service` next to a test —
  build the object **inline** in the test (it stays self-contained, like the auth command tests), or
  use the shared **builder** (`tests/builders.py`) / **fixture** if one fits. A helper is justified
  only once the *same* construction is repeated across files — and then it's a builder/fixture, not a
  file-local `_make_*`.
- **Need it for a test but it's not a test?** (a stateless infra instance, a configured service) —
  check for an existing **fixture** first; only construct inline if none exists.

### Where a reusable thing lives decides whether you can reach it

pytest resolves fixtures only from `conftest.py` files **above** the test on the path, and imports the
root `conftest.py` **before** any child conftest. The conftests already exist — **add to them, don't
invent new layers.** Three levels, narrowest that still reaches every consumer:

- **`tests/conftest.py` (root, already exists)** — suite-wide setup (env bootstrap, the marker hook)
  and fixtures reused across **levels** (a thing unit *and* integration/api all want). The env
  bootstrap here runs before any `app` import, so child conftests may `import app` at top level freely;
  the root itself must keep app imports after the bootstrap (`# noqa: E402`).
- **`tests/unit/conftest.py`** — cross-**domain** but **unit-only** fixtures: stateless infra built
  with an *explicit test config that bypasses `settings`* (`jwt_service` with a literal secret, real
  hashers). api/integration can't reuse these (the app decodes with `settings`), so they don't belong
  at the root.
- **`tests/unit/<domain>/conftest.py`** — the domain's service-under-test wiring on fakes.

If you need a fixture that currently sits in a single domain's `conftest.py` from another domain,
**promote it up** to the right shared level instead of copying it. One definition, reused everywhere.

**Fixtures always live in a `conftest.py`, never inline in a test module** — even a fixture used by a
single test file. Put it in the **nearest `conftest.py` that reaches every consumer**: for a one-file
fixture that's a `conftest.py` in the file's own directory (e.g. a real `Argon2SaltedHasher` used only
by `tests/unit/shared/infra/crypto/` → `tests/unit/shared/infra/crypto/conftest.py`). Defining
`@pytest.fixture` in a `test_*.py` is not allowed here.

## Fixtures

Two-level conftest: root `tests/conftest.py` exposes shared fakes/builders as fixtures; a
per-domain `conftest.py` (e.g. `tests/unit/auth/conftest.py`) assembles the service-under-test on
fakes so the wiring isn't repeated. Default scope `function` — fakes are cheap and must be clean
between tests.

## Coverage

Wire `pytest-cov` from day one, but **do not** set `--cov-fail-under` until a baseline exists
(red CI on an empty suite is noise). Targets once populated: domain ~90%, application ~80%. Don't
chase 100% on infra/presentation in the unit phase.

## Conventions

- **Flat functions only — no test classes.** Folder→file already groups tests; a class would group
  the same thing twice. In large files group by naming (`test_login_*`) and subset with `-k login`.
- **Do not hand-tag markers** — they're auto-applied from the path (see Directory layout).
- `asyncio_mode = "auto"` is set → write `async def test_...` **without** any decorator.
- Follow ruff `PT` (flake8-pytest-style): `pytest.raises(SomeError)` **with `match=`** where it adds
  signal; parametrize via `@pytest.mark.parametrize`.
- **Named arguments everywhere**, in tests too (project rule).
- Each test has a **one-line Russian docstring** stating what it asserts (the descriptive name
  `test_<unit>_<condition>_<expected>` plus one short line).
- **Forward-compat:** design fakes as full port replacements, not one-off stubs — the same fakes
  from `tests/fakes/` are reused in the **api** phase via `app.dependency_overrides[...]` and a fake
  `TaskBusPort` via `app.registry`.

## Anti-patterns (do not)

- Mock `AsyncSession`/SQLAlchemy or unit-test repositories in isolation → use integration.
- Assert on private internals (`service._uow`) → ruff `SLF001` flags it anyway.
- Over-mock collaborators and assert call order → brittle; prefer fakes + state assertions.
- Freeze time globally or inject a clock for tests → construct explicit timestamps.
- Use real Argon2 in every service test → use `FakeSaltedHasher`, keep one real roundtrip test.
- Recreate an existing fixture/fake/builder, or add a file-local `_make_*` helper when one already
  exists → scan the suite first and reuse (see "Reuse before create").

## Tooling

- **Now (dev group):** `pytest-cov`; optionally `time-machine` (point use).
- **Later (integration phase):** `testcontainers[postgres]` (or reuse the compose Postgres).
- `pytest` + `pytest-asyncio` are already present. Make targets: `make test` (unit+api, fast, no
  Docker) and `make coverage` (same + cov); `make test-unit` / `test-api` / `test-integration` by
  level, `make test-auth` / `test-users` / `test-shared` by domain. Integration needs Docker
  (testcontainers) and is deliberately **not** in `make check` — run it via `make test-integration`
  or the root `make test-infra`.
