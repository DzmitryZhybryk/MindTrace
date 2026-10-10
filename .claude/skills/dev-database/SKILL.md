---
name: dev-database
description: Use when working with the MindTrace dev database - applying, creating or rolling back Alembic migrations, loading the places dataset, recreating the dev DB from scratch, inspecting schema or running EXPLAIN against it, or previewing migration SQL for locks.
---

# Dev database operations

Schema and query design (indexes, locking, safe migrations) is the global `postgres` skill. This
one covers only how to reach and manage **this project's dev database**. There is no production
database on this host.

## Access

`POSTGRES_HOST=mindtrace_pg` resolves only inside the docker network; from the host the port is
published as `5439`.

```bash
docker compose exec postgres psql -U mindtrace -d mindtrace    # from the container, simplest
psql -h localhost -p 5439 -U mindtrace -d mindtrace            # from the host
```

Never print or paste credentials; read variable names from `.env` (see global CLAUDE.md).

## Migrations (from `backend/`, against the running container)

```bash
make migrate-create "description"    # autogenerate
make migrate-upgrade                 # apply, then the procrastinate schema (see below)
make migrate-downgrade               # roll back one
make migrate-history
make migrate-current
uv run alembic upgrade <base>:<head> --sql    # SQL only, without applying - to inspect locks
```

The init migration is edited in place while there is no production.

## Procrastinate schema

The `procrastinate_*` tables are not in alembic: `python -m app.shared.infra.procrastinate` applies
them, and `make migrate-upgrade` runs it right after `alembic upgrade head` (the prod and e2e
`migrate` services do the same). Autogenerate ignores these tables (`include_name` in
`migrations/env.py`), so a new revision never proposes dropping them.

The command only checks that `procrastinate_jobs` exists, not which version of the schema is
there. After bumping procrastinate, look in the installed package's `procrastinate/sql/migrations/`
for files newer than the previous version: apply them by hand, or recreate the dev DB.

## Places dataset

`make geo-load` (from `backend/`) loads the datasets listed in `manifest.toml` into the dev DB and
skips what is already loaded. The dataset file is taken from `backend/.geo-cache` when already
downloaded.

## Recreate the dev DB from scratch

From the repo root:

```bash
make stop && docker volume rm mindtrace_pg_data && make run
```

Then from `backend/`: `make migrate-upgrade && make geo-load`.

Until `make migrate-upgrade` has run, the worker has no procrastinate schema and keeps restarting
(`restart: unless-stopped`). It recovers on its own within a minute;
`docker compose restart mindtrace_worker` brings it up immediately.
