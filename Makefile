.PHONY: help hooks check test test-back test-front test-integration test-e2e test-e2e-dev e2e-clean test-infra \
        run stop restart logs ps prod-config prod-pull prod-up prod-down

.DEFAULT_GOAL := help

# Корневой Makefile-оркестратор монорепо. Делегирует в самодостаточные backend/ и frontend/
# через `make -C <dir>` (меняет CWD до запуска — uv и npm получают свою директорию, venv в
# backend/.venv и node_modules в frontend/ остаются на месте). Под-Makefile'ы независимы и
# по-прежнему запускаются из своих папок; здесь — только сквозные агрегаты «обе стороны разом».
# Параллелизм держим внутри pytest/vitest, а не на уровне make: не гоняем обе стороны
# одновременно, чтобы вывод оставался читаемым и не толкались за Docker.
.NOTPARALLEL:

# Colors for output
ifeq ($(OS),Windows_NT)
    ESC     := $(shell printf '\e')
    RESET   := $(ESC)[0m
    GREEN   := $(ESC)[32m
    PURPLE  := $(ESC)[35m
    AZURE   := $(ESC)[36m
else
    RESET  := \033[0m
    GREEN  := \033[32m
    PURPLE := \033[35m
    AZURE  := \033[36m
endif

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_%-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${AZURE}%-18s${RESET} %s\n", $$1, $$2}'

# --- Pass-through: проксируют ЛЮБОЙ таргет под-Makefile с префиксом be-/fe- ---
# Напр.: make be-lint, make be-format, make be-migrate-upgrade, make fe-dev, make fe-build.
# Ограничение: таргеты с позиционным аргументом (migrate-create "desc", migrate-downgrade <rev>)
# запускай из backend/ — аргумент через префикс корректно не пробрасывается.
be-%: ## Проксировать backend-таргет: make be-<target> (be-lint, be-format, …)
	@$(MAKE) -C backend $*

fe-%: ## Проксировать frontend-таргет: make fe-<target> (fe-dev, fe-build, …)
	@$(MAKE) -C frontend $*

# --- Оркестрация стека (compose живёт в ops/) ---
# `--project-directory .` фиксирует project-dir корнем репо, а не папкой compose-файла:
# относительные пути внутри compose (build-context ./backend, конфиги ./ops/loki.yaml) и
# единый корневой .env резолвятся от корня независимо от того, что compose лежит в ops/.
# Поэтому стек поднимается через эти таргеты, а не голым `docker compose up` из ops/.
COMPOSE      := docker compose --project-directory . -f ops/docker-compose.yaml
COMPOSE_PROD := docker compose --project-directory . -f ops/docker-compose.prod.yaml

run: ## Поднять dev-стек (app+worker+pg+frontend+логирование)
	$(COMPOSE) up -d

stop: ## Остановить dev-стек (тома/данные сохраняются)
	$(COMPOSE) down

restart: ## Перезапустить dev-стек
	$(COMPOSE) restart

logs: ## Логи dev-стека (follow)
	$(COMPOSE) logs -f

ps: ## Статус контейнеров dev-стека
	$(COMPOSE) ps

# --- Prod-стек (образы из GHCR; .env с прод-секретами лежит на сервере) ---
prod-config: ## Валидация прод-compose (раскрытие anchor + проверка)
	$(COMPOSE_PROD) config

prod-pull: ## Стянуть свежие образы из GHCR
	$(COMPOSE_PROD) pull

prod-up: ## Поднять прод-стек (one-shot миграции прогоняются автоматически до app)
	$(COMPOSE_PROD) up -d

prod-down: ## Остановить прод-стек (тома/данные сохраняются)
	$(COMPOSE_PROD) down

# --- Git hooks: мерж-гейт покрытия без CI ---
# Разовая активация pre-commit hook'а (.githooks/pre-commit): блокирует commit при покрытии < 90%.
hooks: ## Активировать git-хуки репозитория (pre-commit coverage-гейт, core.hooksPath=.githooks)
	@git config core.hooksPath .githooks
	@echo "${GREEN}INFO :  ${AZURE}git hooks активированы: ${PURPLE}core.hooksPath=.githooks${RESET}"

# --- Quality gate: полный прогон обеих сторон ---
# Одна сторона — через pass-through (make be-lint, fe-typecheck). Полный гейт — check.
check: be-check fe-check ## Полный гейт обеих сторон (lint/typecheck/тесты unit+api + arch/audit; integration/e2e отдельно — make test-infra)

# --- Tests (fast): дейли-драйвер, без Docker ---
test-back: ## Backend unit+api (без Docker)
	@$(MAKE) -C backend test

test-front: ## Frontend unit+component (jsdom)
	@$(MAKE) -C frontend test

test: test-back test-front ## Все быстрые тесты обеих сторон (на каждый коммит)

# --- Tests (heavy): перед мержем/релизом. Самодостаточны: каждый поднимает свою одноразовую инфру ---
# Один проект (mindtrace_e2e) = фиксированные имена → ресурсы переиспользуются, а не плодятся по
# прогонам. `down -v --remove-orphans` сносит контейнеры + проектную сеть + тома (вкл. node_modules;
# данные PG — в tmpfs/RAM, диска не касаются). Что переживает: собранные образы (4 шт., bounded,
# переиспользуются) и глобальный build-cache — это НЕ per-run мусор; глубокая зачистка — `make e2e-clean`.
COMPOSE_E2E := docker compose --project-directory . -f ops/docker-compose.e2e.yaml

test-integration: ## Backend integration (testcontainers → Docker-демон)
	@$(MAKE) -C backend test-integration

# Поднимает одноразовый e2e-стек (tmpfs-Postgres, дев-база не трогается), гоняет Playwright и сносит
# всё начисто. Защитный `down` ПЕРЕД `up` подчищает хвосты прерванного прошлого прогона (Ctrl-C до
# teardown'а). Финальный `down` выполняется всегда (даже при падении тестов), exit-код — от тестов.
# `--wait frontend` (а не голый `--wait`) ждёт healthcheck фронта по цепочке и не спотыкается о
# штатный выход one-shot'а migrate.
test-e2e: ## Frontend e2e (Playwright; сам поднимает одноразовый стек и полностью сносит его после — docker compose up НЕ нужен)
	@echo "${GREEN}INFO :  ${AZURE}Up ephemeral e2e stack (${PURPLE}ops/docker-compose.e2e.yaml${AZURE})${RESET}"
	@$(COMPOSE_E2E) down -v --remove-orphans 2>/dev/null || true
	@{ $(COMPOSE_E2E) up -d --wait frontend && \
	   E2E_BASE_URL=http://localhost:5273 $(MAKE) -C frontend test-e2e; }; \
	status=$$?; \
	if [ $$status -ne 0 ]; then \
		echo "${GREEN}INFO :  ${AZURE}e2e failed (exit $$status) — tail логов сервисов перед сносом${RESET}"; \
		$(COMPOSE_E2E) logs --tail=50 migrate worker app frontend 2>/dev/null || true; \
	fi; \
	echo "${GREEN}INFO :  ${AZURE}Tearing down ephemeral e2e stack (containers + network + volumes)${RESET}"; \
	$(COMPOSE_E2E) down -v --remove-orphans; \
	exit $$status

# База уже поднятого дев-стека (`make run`). Переопределяется, если фронт слушает не там.
DEV_BASE_URL ?= http://localhost:5173

# Прогон по УЖЕ поднятому дев-стеку — для цикла разработки: не тратит ~минуту на подъём и снос
# одноразового окружения. Плата за скорость — тесты пишут в ДЕВ-БАЗУ: `registerUser` заводит
# реального пользователя на каждый прогон, и они накапливаются. Ради этого и существует
# отдельный `make test-e2e` с tmpfs-Postgres; выбирай по ситуации, а не по привычке.
#
# Готовность проверяем POST'ом на /v1/auth/refresh/, а не GET'ом на «/»: он проходит весь путь,
# который нужен тестам — Vite отдаёт SPA И проксирует /v1 на backend. Живой стек отвечает 401
# (нет cookie), мёртвый — не отвечает вовсе. GET «/» показал бы только что Vite жив, а бэк за
# ним мог бы лежать. `/healthz` для этого не годится: он подключён без префикса /v1, а Vite
# проксирует только /v1 — снаружи его не достать.
test-e2e-dev: ## Frontend e2e по УЖЕ ПОДНЯТОМУ дев-стеку (make run). Быстро, но ПИШЕТ В ДЕВ-БАЗУ. E2E_ARGS="--project=chromium"
	@code=$$(curl -s -o /dev/null -X POST -w '%{http_code}' --max-time 5 $(DEV_BASE_URL)/v1/auth/refresh/ 2>/dev/null); \
	if [ -z "$$code" ] || [ "$$code" = "000" ]; then \
		echo "${GREEN}INFO :  ${AZURE}Дев-стек не отвечает на ${PURPLE}$(DEV_BASE_URL)${AZURE}${RESET}"; \
		echo "${GREEN}INFO :  ${AZURE}Подними его через ${PURPLE}make run${AZURE}, либо гоняй одноразовый: ${PURPLE}make test-e2e${RESET}"; \
		exit 1; \
	fi; \
	echo "${GREEN}INFO :  ${AZURE}Дев-стек жив (${PURPLE}$(DEV_BASE_URL)${AZURE}, /v1 отвечает $$code)${RESET}"; \
	echo "${GREEN}WARN :  ${AZURE}Тесты заведут пользователей в ${PURPLE}дев-базе${AZURE} — она НЕ одноразовая${RESET}"; \
	E2E_BASE_URL=$(DEV_BASE_URL) $(MAKE) -C frontend test-e2e E2E_ARGS='$(E2E_ARGS)'

e2e-clean: ## Глубокая зачистка e2e-стека: контейнеры + сеть + тома + собранные образы (--rmi local)
	@echo "${GREEN}INFO :  ${AZURE}Deep clean ephemeral e2e stack (incl. built images)${RESET}"
	@$(COMPOSE_E2E) down -v --remove-orphans --rmi local 2>/dev/null || true

test-infra: ## Тяжёлый прогон: backend integration + frontend e2e (оба самодостаточны, внешний стек не нужен)
	@echo "${GREEN}INFO :  ${AZURE}Heavy suite — обе стороны поднимают свою одноразовую инфру (Docker-демон должен быть запущен)${RESET}"
	@$(MAKE) test-integration
	@$(MAKE) test-e2e
