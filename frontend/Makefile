.PHONY: help install dev build typecheck lint lint-fix test coverage check

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
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${AZURE}%-13s${RESET} %s\n", $$1, $$2}'

install: ## Install dependencies (npm install)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}npm install${AZURE}'${RESET}"
	@npm install

dev: ## Start Vite dev server
	@npm run dev

build: ## Type-check and build production bundle
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}tsc + vite build${AZURE}'${RESET}"
	@npm run build

typecheck: ## Type-check sources with tsc
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}tsc${AZURE}' typecheck${RESET}"
	@npm run typecheck

lint: ## Lint sources with oxlint
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}oxlint${AZURE}' lint${RESET}"
	@npm run lint

lint-fix: ## Auto-fix lint issues (oxlint --fix)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}oxlint --fix${AZURE}'${RESET}"
	@npm run lint:fix

test: ## Run tests once (vitest run)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' tests${RESET}"
	@npm run test:run

coverage: ## Run tests with coverage report
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' coverage${RESET}"
	@npm run coverage

check: lint typecheck test ## Run lint + typecheck + tests (CI-style pipeline)
