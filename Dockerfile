FROM python:3.14-alpine AS base
COPY --from=ghcr.io/astral-sh/uv:0.9.9 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONFAULTHANDLER=1 \
  PYTHONUNBUFFERED=1 \
  PIP_NO_CACHE_DIR=1 \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PIP_ROOT_USER_ACTION=ignore \
  UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_PYTHON_DOWNLOADS=0

WORKDIR /src

# create nonroot user to run app
RUN addgroup -S nonroot \
  && adduser -S nonroot -G nonroot \
  && chown -R nonroot:nonroot /src

FROM base AS builder

# install global dependencies for kafka
# hadolint ignore=DL3018
RUN apk add --no-cache --virtual .build-deps gcc musl-dev librdkafka-dev \
  && rm -rf /root/.cache/pip/*

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
  --mount=type=bind,source=uv.lock,target=uv.lock \
  --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
  uv sync --locked --no-install-project --no-editable \
  # clean cache
  && apk update \
  && apk del .build-deps

# copy app files to workdir
COPY ./app ./app
COPY ./migrations ./migrations
COPY ./alembic.ini ./
COPY ./entrypoint.sh ./
COPY pyproject.toml uv.lock ./

RUN chmod +x ./entrypoint.sh

# Sync the project
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-editable

FROM base AS final

# copy system dependencies from builder stage
COPY --from=builder /usr/local/lib/python3.14/site-packages /usr/local/lib/python3.14/site-packages
# copy app dependencies from builder stage
COPY --from=builder --chown=nonroot:nonroot /src/.venv /src/.venv
COPY --from=builder --chown=nonroot:nonroot /src/app ./app
COPY --from=builder --chown=nonroot:nonroot /src/pyproject.toml ./pyproject.toml
COPY --from=builder --chown=nonroot:nonroot /src/migrations ./migrations
COPY --from=builder --chown=nonroot:nonroot /src/alembic.ini ./alembic.ini
COPY --from=builder --chown=nonroot:nonroot /src/entrypoint.sh /entrypoint.sh

ENV PATH="/src/.venv/bin:$PATH"
USER nonroot
