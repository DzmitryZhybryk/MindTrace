# syntax=docker/dockerfile:1.7
FROM python:3.14-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS base
COPY --from=ghcr.io/astral-sh/uv:0.9.9@sha256:f6e3549ed287fee0ddde2460a2a74a2d74366f84b04aaa34c1f19fec40da8652 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /src

RUN groupadd --system nonroot \
    && useradd --system --gid nonroot --home-dir /src nonroot \
    && mkdir -p /opt/venv \
    && chown -R nonroot:nonroot /src /opt/venv

# -----------------------------------------------------------------------------
# deps: install locked dependencies only — cached separately from app code
# -----------------------------------------------------------------------------
FROM base AS deps

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-editable

# -----------------------------------------------------------------------------
# dev: used by docker-compose; source tree is volume-mounted at runtime,
# so we stop after deps and let uvicorn --reload pick up changes live.
# -----------------------------------------------------------------------------
FROM deps AS dev

# -----------------------------------------------------------------------------
# builder: install the project itself into /opt/venv
# -----------------------------------------------------------------------------
FROM deps AS builder

COPY ./app ./app
COPY ./migrations ./migrations
COPY ./alembic.ini ./alembic.ini
COPY pyproject.toml uv.lock README.md ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-editable

# -----------------------------------------------------------------------------
# final: minimal production image
# -----------------------------------------------------------------------------
FROM base AS final

COPY --from=builder --chown=nonroot:nonroot /opt/venv /opt/venv
COPY --from=builder --chown=nonroot:nonroot /src/app ./app
COPY --from=builder --chown=nonroot:nonroot /src/migrations ./migrations
COPY --from=builder --chown=nonroot:nonroot /src/alembic.ini ./alembic.ini
COPY --from=builder --chown=nonroot:nonroot /src/pyproject.toml ./pyproject.toml

USER nonroot
