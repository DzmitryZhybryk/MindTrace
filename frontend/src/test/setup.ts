/**
 * Глобальный setup для Vitest (подключён через `test.setupFiles` в `vite.config.ts`).
 *
 * Делает четыре вещи:
 *  1. i18n — синхронно подгружает `en`-бандлы на тот же singleton-инстанс, что
 *     использует код (в приложении локали грузятся лениво через dynamic `import()`,
 *     поэтому без этого `i18n.t(...)` вернул бы сам ключ). Так `messageForCode` и UI
 *     резолвят реальные английские тексты — тестируем настоящий маппинг, а не моки.
 *  2. jest-dom — регистрирует матчеры (`toBeInTheDocument` и пр.) в `expect`.
 *  3. jsdom-полифилы — `matchMedia` и `ResizeObserver`, которых нет в jsdom, но к
 *     которым обращаются Mantine (Menu/Modal) и контейнер `GlobeCanvas`.
 *  4. MSW — сетевой слой component-тестов: listen/reset/close + очистка модульного
 *     состояния (`tokenStore`, `sessionStorage`) и моков после каждого теста.
 *     Unit-тесты ставят собственный `fetch`-мок и MSW минуют (см. `handlers.ts`).
 */

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { clearAccessToken } from "../auth/tokenStore";
import enAuth from "../locales/en/auth.json";
import enCommon from "../locales/en/common.json";
import enErrors from "../locales/en/errors.json";
import enJourneys from "../locales/en/journeys.json";
import { i18n } from "../i18n";
import { server } from "./handlers";

i18n.addResourceBundle("en", "common", enCommon, true, true);
i18n.addResourceBundle("en", "auth", enAuth, true, true);
i18n.addResourceBundle("en", "errors", enErrors, true, true);
i18n.addResourceBundle("en", "journeys", enJourneys, true, true);

void i18n.changeLanguage("en");

// matchMedia: Mantine (Menu/Modal/визуальные хуки) обращается к нему, в jsdom его нет.
// Ставим прямым присваиванием (не через vi.stubGlobal), чтобы `vi.unstubAllGlobals()`
// в afterEach его не снёс.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});

// ResizeObserver: нет в jsdom; контейнер GlobeCanvas и часть Mantine его инстанцируют.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// scrollIntoView: нет в jsdom; Mantine Combobox (selectFirstOption/навигация стрелками)
// вызывает его на активной опции.
Element.prototype.scrollIntoView = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  // Сначала размонтируем дерево (отписки эффектов), затем чистим сеть и состояние.
  cleanup();
  server.resetHandlers();
  clearAccessToken();
  // Node ≥26 инжектит собственные глобалы localStorage/sessionStorage (экспериментальный
  // Web Storage API), которые затеняют jsdom-storage и роняют этот clear(). Отключены флагом
  // --no-experimental-webstorage в NODE_OPTIONS test-скриптов (package.json); на node 22 — no-op.
  sessionStorage.clear();
  // Persist-состояние (флаг легенды, дисмисс баннера, язык i18next) живёт в
  // localStorage — чистим, чтобы оно не протекало в соседние тесты.
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => server.close());
