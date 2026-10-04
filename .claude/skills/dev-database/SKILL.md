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
make migrate-upgrade                 # apply
make migrate-downgrade               # roll back one
make migrate-history
make migrate-current
uv run alembic upgrade <base>:<head> --sql    # SQL only, without applying - to inspect locks
```

The init migration is edited in place while there is no production.

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
