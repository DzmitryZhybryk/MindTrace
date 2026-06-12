/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://app:8000";

/**
 * Зона тестов Vitest по расширению: unit (`*.test.ts` — чистая логика) vs component
 * (`*.test.tsx` — рендер React; JSX требует `.tsx`). Управляется `VITEST_SCOPE` из Makefile
 * (`make test-unit` / `make test-component`); по умолчанию — оба. e2e (`*.spec.ts`) — Playwright,
 * сюда не попадает. Glob `*.test.ts` не матчит `.test.tsx` (лишний `x`) — сплит чистый.
 */
function resolveVitestInclude(): string[] {
  const scope = process.env.VITEST_SCOPE;
  if (scope === "unit") {
    return ["src/**/*.test.ts"];
  }

  if (scope === "component") {
    return ["src/**/*.test.tsx"];
  }

  return ["src/**/*.test.{ts,tsx}"];
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/v1": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Только co-located unit/component-тесты из src (никогда `e2e/**/*.spec.ts` — это Playwright).
    // Конкретный набор зависит от VITEST_SCOPE (см. resolveVitestInclude).
    include: resolveVitestInclude(),
    coverage: {
      provider: "v8",
      // Покрытие пока без порога (как pytest-cov без --cov-fail-under до набора baseline).
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/**/*.d.ts"],
    },
  },
});
