import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAuth } from "./useAuth";

/** Компонент, дёргающий useAuth — для проверки контракта «только внутри провайдера». */
function Consumer() {
  useAuth();
  return null;
}

describe("useAuth", () => {
  it("бросает, если вызван вне <AuthProvider>", () => {
    // React печатает ошибку рендера в console.error — глушим, чтобы не зашумлять вывод.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow("useAuth must be used within an <AuthProvider>");
  });
});
