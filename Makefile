.PHONY: help format lint typecheck dead-code check test-all migrate-create migrate-upgrade migrate-downgrade migrate-history migrate-current

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
RUFF_SOURCES := app migrations

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

check: format lint typecheck dead-code ## Run format + lint + typecheck + dead-code

test-all: ## Run all tests in the tests/ directory
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}pytest${AZURE}' tests${RESET}"
	@uv run --no-sync pytest tests

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
