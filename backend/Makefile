.PHONY: help format lint typecheck dead-code check test-all test-unit test-integration test-api test-auth test-users test-shared test-m migrate-create migrate-upgrade migrate-downgrade migrate-history migrate-current

# Colors for output
ifeq ($(OS),Windows_NT)
    ESC     := $(shell printf '\e')
    RESET   := $(ESC)[0m
    BLACK   := $(ESC)[30m
    RED     := $(ESC)[31m
    GREEN   := $(ESC)[32m
    YELLOW  := $(ESC)[33m
    BLUE    := $(ESC)[34m
    PURPLE  := $(ESC)[35m
    AZURE   := $(ESC)[36m
    WHITE   := $(ESC)[37m
else
    RESET  := \033[0m
    BLACK  := \033[30m
    RED    := \033[31m
    GREEN  := \033[32m
    YELLOW := \033[33m
    BLUE   := \033[34m
    PURPLE := \033[35m
    AZURE  := \033[36m
    WHITE  := \033[37m
endif

# Sources to check
RUFF_SOURCES := app migrations tests

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${AZURE}%-15s${RESET} %s\n", $$1, $$2}'

format: ## Auto-format python source files
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ruff${AZURE}' format${RESET}"
	@uv run --no-sync ruff check --fix --unsafe-fixes $(RUFF_SOURCES)
	@uv run --no-sync ruff format $(RUFF_SOURCES)

lint: ## Lint python source files with ruff
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ruff${AZURE}' lint${RESET}"
	@uv run --no-sync ruff check $(RUFF_SOURCES)

typecheck: ## Type check python source files with ty
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ty${AZURE}' typecheck${RESET}"
	@uv run --no-sync ty check $(RUFF_SOURCES)

dead-code: ## Find unused code with vulture
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vulture${AZURE}' dead code check${RESET}"
	@uv run --no-sync vulture

check: format lint typecheck dead-code test-all ## Run format + lint + typecheck + dead-code + tests

test-all: ## Run all tests in the tests/ directory with coverage
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}pytest${AZURE}' tests with coverage${RESET}"
	@uv run --no-sync pytest tests --cov=app --cov-report=term-missing

# Запуск тестов по осям маркеров (авто-маркировка по пути — см. tests/conftest.py).
# `|| [ $$? -eq 5 ]` — не считать "тесты не найдены" (exit 5) ошибкой: пустые группы
# (ещё ненаполненные уровни/домены) не должны валить таргет.
test-unit: ## Run unit-level tests (-m unit)
	@uv run --no-sync pytest -m unit || [ $$? -eq 5 ]

test-integration: ## Run integration-level tests (-m integration)
	@uv run --no-sync pytest -m integration || [ $$? -eq 5 ]

test-api: ## Run api-level tests (-m api)
	@uv run --no-sync pytest -m api || [ $$? -eq 5 ]

test-auth: ## Run auth-domain tests, any level (-m auth)
	@uv run --no-sync pytest -m auth || [ $$? -eq 5 ]

test-users: ## Run users-domain tests, any level (-m users)
	@uv run --no-sync pytest -m users || [ $$? -eq 5 ]

test-shared: ## Run shared-infra tests, any level (-m shared)
	@uv run --no-sync pytest -m shared || [ $$? -eq 5 ]

test-m: ## Run tests by marker expression (usage: make test-m M="unit and users")
	@uv run --no-sync pytest -m "$(M)" || [ $$? -eq 5 ]

migrate-create: ## Create a new migration (usage: make migrate-create "description")
	@ARGS="$(filter-out $@,$(MAKECMDGOALS))"; \
	if [ -z "$$ARGS" ]; then \
		echo "${RED}ERROR: Message is required. Usage: make migrate-create \"description\"${RESET}"; \
		exit 1; \
	fi; \
	echo "${GREEN}INFO :  ${AZURE}Creating migration: ${PURPLE}$$ARGS${RESET}"; \
	docker exec -it mindtrace_app uv run alembic revision --autogenerate -m "$$ARGS"

migrate-upgrade: ## Apply all pending migrations
	@echo "${GREEN}INFO :  ${AZURE}Applying migrations${RESET}"
	@docker exec -it mindtrace_app uv run alembic upgrade head

migrate-downgrade: ## Downgrade one migration (usage: make migrate-downgrade)
	@REVISION="$(filter-out $@,$(MAKECMDGOALS))"; \
	if [ -z "$$REVISION" ]; then \
		REVISION="-1"; \
	fi; \
	echo "${GREEN}INFO :  ${AZURE}Downgrading migration: ${PURPLE}$$REVISION${RESET}"; \
	docker exec -it mindtrace_app uv run alembic downgrade $$REVISION

%:
	@:

migrate-history: ## Show migration history
	@echo "${GREEN}INFO :  ${AZURE}Migration history${RESET}"
	@docker exec -it mindtrace_app uv run alembic history

migrate-current: ## Show current migration version
	@echo "${GREEN}INFO :  ${AZURE}Current migration version${RESET}"
	@docker exec -it mindtrace_app uv run alembic current
