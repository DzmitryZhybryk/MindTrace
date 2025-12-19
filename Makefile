.PHONY: help format lint typecheck

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
RUFF_SOURCES := app

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${AZURE}%-15s${RESET} %s\n", $$1, $$2}'

format: ## Auto-format python source files
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ruff${AZURE}' format${RESET}"
	@uv run --no-sync ruff check --select F --select I --select E --fix $(RUFF_SOURCES)
	@uv run --no-sync ruff format $(RUFF_SOURCES)

lint: ## Lint python source files with ruff
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ruff${AZURE}' lint${RESET}"
	@uv run --no-sync ruff check $(RUFF_SOURCES)

typecheck: ## Type check python source files with ty
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}ty${AZURE}' typecheck${RESET}"
	@uv run --no-sync ty check $(RUFF_SOURCES)
