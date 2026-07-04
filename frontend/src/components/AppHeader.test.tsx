import { describe, expect, it } from "vitest";

import { makeAuthValue, renderWithProviders, screen } from "../test/render";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("«Journeys» — ссылка на раздел, «Mind» (не реализован) — не ссылка с бейджем «Soon»", () => {
    // emailVerified: true — без баннера верификации, чтобы не шуметь в DOM.
    renderWithProviders(<AppHeader />, {
      authValue: makeAuthValue({ isAuthenticated: true, emailVerified: true }),
    });

    expect(screen.getByRole("link", { name: "Journeys" })).toHaveAttribute("href", "/journeys");

    // «Mind» не навигирует: рендерится не ссылкой (в никуда не ведёт) и помечен «Soon».
    expect(screen.queryByRole("link", { name: /Mind/u })).toBeNull();
    const mind = screen.getByText("Mind");
    expect(mind).toHaveAttribute("aria-disabled", "true");
    expect(mind).toHaveTextContent("Soon");
  });
});
