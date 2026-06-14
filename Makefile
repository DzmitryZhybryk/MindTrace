.PHONY: help check test test-back test-front test-integration test-e2e test-infra

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

# --- Quality gate: полный прогон обеих сторон ---
# Одна сторона — через pass-through (make be-lint, fe-typecheck). Полный гейт — check.
check: be-check fe-check ## Полный гейт обеих сторон (lint/typecheck/тесты unit+api + arch/audit; integration/e2e отдельно — make test-infra)

# --- Tests (fast): дейли-драйвер, без Docker ---
test-back: ## Backend unit+api (без Docker)
	@$(MAKE) -C backend test

test-front: ## Frontend unit+component (jsdom)
	@$(MAKE) -C frontend test

test: test-back test-front ## Все быстрые тесты обеих сторон (на каждый коммит)

# --- Tests (heavy): перед мержем/релизом, нужна внешняя инфра ---
test-integration: ## Backend integration (testcontainers → Docker-демон)
	@$(MAKE) -C backend test-integration

test-e2e: ## Frontend e2e (Playwright; нужен поднятый стек: docker compose up -d)
	@$(MAKE) -C frontend test-e2e

test-infra: ## Тяжёлый прогон: backend integration + frontend e2e (стек должен быть поднят)
	@echo "${GREEN}INFO :  ${AZURE}Heavy suite — стек должен быть поднят (${PURPLE}docker compose up -d${AZURE})${RESET}"
	@$(MAKE) test-integration
	@$(MAKE) test-e2e
