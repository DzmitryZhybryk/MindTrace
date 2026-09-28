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
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/**/*.d.ts",
        // Сгенерированный из OpenAPI SDK: свой код там не пишется, покрывать нечего.
        "src/api/generated/**",
        // Императивный three/WebGL-рендер глобусов: в jsdom не исполняется, тестировать
        // нечего. Вся чистая математика вынесена в src/components/globe/{geo,route,routes}.ts
        // и покрыта unit-тестами — эти файлы остаются под покрытием.
        // HomeGlobe/AuthGlobe удалены редизайном; их роль исполняет app-global
        // globe/PersistentGlobeHost поверх GlobeCanvas (покрыт component-тестом).
        "src/components/JourneyGlobe.tsx",
        // Декларативная композиция без логики: таблица маршрутов и layout-каркасы с <Outlet/>.
        // Ветвлений нет, покрывается e2e-навигацией, а не unit/component. PublicLayout стал
        // тривиальным после переезда глобуса на корень (шапка + <Outlet/> через кросс-фейд).
        "src/App.tsx",
        "src/pages/journeys/JourneysLayout.tsx",
        "src/pages/PublicLayout.tsx",
      ],
      // Мерж-гейт: покрытие >= 90% (форсится pre-commit hook'ом, не CI — см. CLAUDE.md).
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
