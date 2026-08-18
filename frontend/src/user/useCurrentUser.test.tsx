import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCurrentUser } from "./useCurrentUser";

/** Компонент, дёргающий useCurrentUser — для проверки контракта «только внутри провайдера». */
function Consumer() {
  useCurrentUser();
  return null;
}

describe("useCurrentUser", () => {
  it("бросает, если вызван вне <CurrentUserProvider>", () => {
    // React печатает ошибку рендера в console.error — глушим, чтобы не зашумлять вывод.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow("useCurrentUser must be used within a <CurrentUserProvider>");
  });
});
