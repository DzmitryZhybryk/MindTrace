---
name: backend-tests
description: Write or extend backend unit tests for the MindTrace FastAPI service (DDD, pytest, async). Use when the user asks to write/add/cover backend tests, test a domain/service/entity, or scaffold the test suite. Follows the conventions in .claude/rules/python/testing.md (structure, hand-written fakes, thin repository Protocols, determinism). Backend integration/api tests are separate later phases.
---

# Backend tests

Write backend tests for `backend/` following the project's testing constitution. All commands run
from `backend/` (self-contained uv project).

## Source of truth

**Conventions live in `.claude/rules/python/testing.md`** — it is `@`-included in `CLAUDE.md`, so
it's always in context. Do **not** restate or fork those rules here; this skill is only the
*procedure*. Re-read that file before writing if anything is unclear (pyramid, layout, fakes,
Protocols, determinism, coverage, anti-patterns).

## Scope

- **Default focus: `unit/`** (domain entities/VO, application services with fakes, pure helpers,
  crypto/jwt roundtrips). This is where the value is.
- `integration/` (real Postgres) and `api/` (ASGI app) are **separate phases** — only touch them
  when the user explicitly asks.

## Procedure

1. **Locate the target.** Read the code under test in `backend/app/<domain>/<layer>/`. Identify
   branches/invariants worth covering (e.g. `AuthService.refresh` reuse-detection, timing
   mitigation in `login`, idempotent `revoke()`).
2. **Mirror the layout.** Place the test at the path the existing suite dictates — read
   `backend/tests/` rather than assuming. **Never hand-tag markers:** the
   `pytest_collection_modifyitems` hook in `tests/conftest.py` applies level and domain markers
   from the file path.
3. **Prepare fakes (boundary only).**
   - Reuse / add an in-memory fake in `backend/tests/fakes/` (repositories, clients, `TaskBusPort`,
     hashers). Back repositories with a `dict`; `FakeSaltedHasher` avoids real argon2.
   - When writing the **first** fake for a repository, add a thin `typing.Protocol` in the
     **application layer** (`app/<domain>/application/ports.py`, only the methods used) and type both
     the real repo and the fake. By DIP the contract belongs to application; `infra` imports the port
     and implements it (never the reverse). The port module depends only on `domain`.
   - Fake UoW = simple object with the fake repos + `commit = AsyncMock()`.
   - Keep **real** stateless infra (`JWTService`, `TokenIssuer`).
4. **Add builders** for entities/VO in `backend/tests/builders.py` (plain kwargs functions, named
   args, explicit timestamps — no `factory-boy`).
5. **Write the test.** `async def test_<unit>_<condition>_<expected>` (no decorator —
   `asyncio_mode=auto`). State-based assertions; `pytest.raises(Err, match=...)`; parametrize
   variants; named arguments everywhere; assert invariants for random/time values.
6. **Verify green:**
   ```bash
   cd backend
   uv run pytest -m unit            # or the specific test file
   make lint                        # ruff (PT rules included)
   make typecheck                   # ty — catches fake/Protocol drift
   ```
7. **Coverage.** `make coverage`. The 90% threshold is already enforced (`--cov-fail-under=90`
   in the Makefile, forced by the pre-commit hook) — below it the code does not merge, so check
   before committing rather than after.
8. **Review (optional).** For non-trivial additions, ask the user to run `/code-review` — it
   reviews the diff in a fresh subagent. It is user-invoked; you cannot launch it yourself.

## Notes

- Never mock `AsyncSession`/SQLAlchemy or unit-test repositories — that's the integration phase.
- Don't assert private internals (`service._uow`) — ruff `SLF001` will flag it.
- Design fakes as full port replacements: they're reused in the api phase via
  `app.dependency_overrides` and a fake `TaskBusPort` via `app.registry`.
