import { vi } from "vitest";

/**
 * Включает media-запросы, в тексте которых есть один из фрагментов; остальные не совпадают, как в
 * дефолтной заглушке `setup.ts`. Снимается `vi.restoreAllMocks()`.
 */
export function matchMediaQueries(...fragments: string[]): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: fragments.some((fragment) => query.includes(fragment)),
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

/**
 * Включает `prefers-reduced-motion: reduce`: код, который смотрит на эту настройку, заменяет
 * анимации мгновенной сменой. Остальные media-запросы не совпадают. Снимается `vi.restoreAllMocks()`.
 */
export function preferReducedMotion(): void {
  matchMediaQueries("prefers-reduced-motion");
}
