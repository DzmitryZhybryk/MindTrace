---
paths:
  - "backend/tests/**"
  - "backend/pyproject.toml"
  - "backend/Makefile"
---

# Backend tests: layout, markers, fixtures, run targets

Where things live. How a test is written — `testing.md`. Commands run from `backend/`.

## Pyramid

Two orthogonal axes: **level** (speed and dependencies) and **domain** (mirror of `app/`).

| Level | Touches I/O? | Covers |
|---|---|---|
| **unit** | no | domain entities and VOs, application services on fakes, pure helpers, crypto/jwt roundtrips |
| **integration** | real Postgres | repositories, UoW, SQL, `FOR UPDATE` locks, unique constraints, migrations |
| **api** | ASGI app | routes, wiring, `resolve_http_status`, cookies, error envelope |

Most of the value is in `unit/`; keep integration and api thin.

## Layout

Top level by level, then mirror `app/<domain>/<layer>`: `tests/<level>/<domain>/<layer>/test_*.py`.
Shared pieces: `tests/conftest.py`, `tests/fakes/`, `tests/builders.py`. Read the tree for the
current domains instead of assuming.

## Markers

Applied **automatically from the path** by `pytest_collection_modifyitems` in `tests/conftest.py`;
never hand-tag. Level and domain compose: `-m unit`, `-m users`, `-m "unit and users"`. A new level
or domain must be registered in `pyproject.toml` `markers` **and** added to the conftest tuples
(`--strict-markers` rejects unregistered ones).

## Where a fixture lives

pytest resolves fixtures only from `conftest.py` files above the test, and imports the root
`conftest.py` first. Add to the existing conftests; do not invent new layers. Use the narrowest
one that reaches every consumer:

- `tests/conftest.py` — suite-wide setup (env bootstrap, the marker hook) and fixtures reused
  across **levels**. The env bootstrap runs before any `app` import, so child conftests may import
  `app` at top level; the root itself keeps its app imports after the bootstrap (`# noqa: E402`).
- `tests/unit/conftest.py` — cross-domain, **unit-only** fixtures: stateless infra built with an
  explicit test config that bypasses `settings` (`jwt_service` with a literal secret, real hashers).
  api and integration cannot reuse these, since the app decodes with `settings`.
- `tests/unit/<domain>/conftest.py` — the domain's service-under-test wired on fakes.

A fixture needed from another domain is **promoted up** to the right shared level, never copied.
Fixtures always live in a `conftest.py`, never inline in a `test_*.py` — even one used by a single
file: put it in a `conftest.py` in that file's own directory.

## Coverage

Merge threshold is 90% (`make coverage`, `--cov-fail-under=90`), enforced by the pre-commit hook —
see the `git-workflow` skill. Rough targets: domain ~90%, application ~80%; do not chase 100% on
infra and presentation at the unit level.

## Run targets

- `make test` — unit + api, fast, no Docker. `make coverage` — the same with the gate.
- By level: `make test-unit` / `test-api` / `test-integration`. By domain: `make test-<domain>`.
  An intersection of axes: `uv run pytest -m "unit and users"`.
- Integration needs Docker (testcontainers) and is deliberately **not** in `make check`; run it with
  `make test-integration` or the root `make test-infra`.
