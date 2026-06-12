.PHONY: help install dev build typecheck lint lint-fix test test-unit test-component coverage check test-e2e

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
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${AZURE}%-15s${RESET} %s\n", $$1, $$2}'

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

test: ## Run all Vitest tests once — unit + component (vitest run)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' tests${RESET}"
	@npm run test:run

test-unit: ## Run unit tests only (*.test.ts — pure logic)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' unit tests${RESET}"
	@npm run test:unit

test-component: ## Run component tests only (*.test.tsx — rendered React)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' component tests${RESET}"
	@npm run test:component

coverage: ## Run tests with coverage report
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}vitest${AZURE}' coverage${RESET}"
	@npm run coverage

check: lint typecheck test ## Run lint + typecheck + unit/component (fast; e2e is separate — make test-e2e)

test-e2e: ## Run Playwright e2e (requires the stack up: docker compose up -d)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}playwright test${AZURE}' e2e${RESET}"
	@npm run e2e
