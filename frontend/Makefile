.PHONY: help typecheck lint lint-fix audit test test-unit test-component coverage check test-e2e generate-api

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

generate-api: ## Regenerate src/api/generated from backend/openapi.json (run after make be-openapi-dump)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}openapi-ts${AZURE}' codegen${RESET}"
	@npm run generate:api

audit: ## Scan npm dependencies for known vulnerabilities (high+)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}npm audit${AZURE}' security scan${RESET}"
	@npm audit --audit-level=high

check: lint typecheck audit test ## Run lint + typecheck + audit + unit/component (fast; coverage-гейт — отдельно make coverage; e2e — make test-e2e)

# Аргументы, пробрасываемые в playwright: сузить браузер или набор тестов.
# Напр. E2E_ARGS="--project=chromium -g login" — для дев-цикла три браузера избыточны.
E2E_ARGS ?=

test-e2e: ## Run Playwright e2e against E2E_BASE_URL (обычно запускается корневым `make test-e2e` / `make test-e2e-dev`)
	@echo "${GREEN}INFO :  ${AZURE}Run '${PURPLE}playwright test $(E2E_ARGS)${AZURE}' e2e${RESET}"
	@npm run e2e -- $(E2E_ARGS)
