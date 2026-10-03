import { vi } from "vitest";

/**
 * Включает `prefers-reduced-motion: reduce`: код, который смотрит на эту настройку, заменяет
 * анимации мгновенной сменой. Остальные media-запросы не совпадают, как в дефолтной заглушке
 * `setup.ts`. Снимается `vi.restoreAllMocks()`.
 */
export function preferReducedMotion(): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}
