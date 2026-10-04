---
paths:
  - "backend/tests/**"
---

# Backend tests: philosophy and style

How a backend test is written. Where it lives, markers, fixtures placement and run targets are in
`testing-layout.md`; the `backend-tests` skill is the procedure for writing one. Commands run from
`backend/`.

## Classicist, with hand-written fakes

- **State-based, not interaction-based.** Assert on the resulting state or return value, never on
  call order. Use real objects where they are cheap: domain entities, stateless infra
  (`JWTService`, `TokenIssuer`), real hashers inside their own roundtrip test.
- **Fake only the I/O boundary:** repositories, the UoW, external clients (`InternalUsersClient`),
  `TaskBusPort`, the email transport.
- **Constructor DI.** Application services are unit-tested by passing fakes directly, bypassing
  FastAPI. `dependency_overrides` belong to the **api** level only.

### Fakes over mocks

- Hand-written in-memory fakes live in `tests/fakes/` (e.g. a repository backed by a `dict`). They
  survive refactors and read like scenarios (`find` after `insert` returns it).
- A fake UoW is a plain object exposing the fake repositories plus `commit = AsyncMock()`.
- `AsyncMock` / `MagicMock` only for side-effect-only collaborators where the test verifies the call
  happened: `users_client.create_user`, `task_bus.defer`, `uow.commit`.
- Never mock `AsyncSession` / SQLAlchemy. Repositories are covered by integration tests on real Postgres.
- Design a fake as a full replacement of its port, not a one-off stub: the same fakes are reused at
  the api level through `app.dependency_overrides` and a fake `TaskBusPort` through `app.registry`.

### Thin Protocols keep fakes honest

The first time a fake is written for a repository, its port is a `Protocol` in
`app/<domain>/application/ports.py` declaring only the methods in use; the real repository and the
fake are both typed with it, so `ty` catches drift. Port rules (layer, naming, imports) —
`ddd.md`.

## Determinism

- **Time:** construct entities with explicit timestamps (`expires_at`, `revoked_at` are constructor
  arguments). Reach for `time-machine` only to assert "`revoke()` sets *now*". Never freeze time
  globally and never inject a `Clock` into production code for tests.
- **Randomness** (`secrets.token_urlsafe`): never predict the value; assert the invariant
  (`entity.token_hash == hasher.digest(plaintext)`).
- **Argon2 is deliberately slow (~50 ms/hash):** service tests use `FakeSaltedHasher`; the real
  `Argon2SaltedHasher` is covered once in `unit/shared/infra/crypto/` (roundtrip + wrong secret fails).
- **No sleeps:** wait for the condition, not a duration.

## Test data builders

Plain functions with keyword defaults in `tests/builders.py`
(`make_refresh_token(*, expires_at=..., revoked_at=None)`). No `factory-boy`, no `faker` —
determinism beats realism.

## Reuse before create

Before adding a test, fixture, fake, builder or helper, enumerate what exists and reuse it. A
near-duplicate is the same defect as copy-pasted production code.

```bash
grep -rn "@pytest.fixture" tests
grep -rn "^def make_\|^class Fake" tests/builders.py tests/fakes
```

Read only the matching definitions, then reuse by name.

- **No file-local `_make_*` helpers.** Build the object inline in the test, or use the shared
  builder or fixture. A helper is justified only once the same construction repeats across files,
  and then it becomes a builder or fixture, not a file-local function.
- Need a stateless infra instance or configured service in a test? Look for an existing fixture
  first; construct inline only if none exists.

## Conventions

- Flat functions, **no test classes**. Group by naming (`test_login_*`) and subset with `-k login`.
- `asyncio_mode = "auto"`: write `async def test_...` with no decorator.
- Name: `test_<unit>_<condition>_<expected>`, plus a **one-line Russian docstring** stating what is asserted.
- ruff `PT` applies: `pytest.raises(SomeError, match=...)` where it adds signal; variants through
  `@pytest.mark.parametrize`.
- Named arguments everywhere, in tests too.

## Anti-patterns

- Mocking `AsyncSession` or unit-testing a repository in isolation → integration test instead.
- Asserting on private internals (`service._uow`) → ruff `SLF001` flags it.
- Over-mocking collaborators and asserting call order.
- Freezing time globally or injecting a clock.
- Real Argon2 in every service test.
- Recreating an existing fixture, fake or builder.
