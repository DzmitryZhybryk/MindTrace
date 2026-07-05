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

  it("на активном разделе таб подсвечен и помечен aria-current", () => {
    renderWithProviders(<AppHeader />, {
      route: "/journeys",
      authValue: makeAuthValue({ isAuthenticated: true, emailVerified: true }),
    });

    const tab = screen.getByRole("link", { name: "Journeys" });
    expect(tab).toHaveClass("app-tab--active");
    expect(tab).toHaveAttribute("aria-current", "page");
  });

  it("в бургер-Drawer активный раздел тоже подсвечен", async () => {
    const { user } = renderWithProviders(<AppHeader />, {
      route: "/journeys",
      authValue: makeAuthValue({ isAuthenticated: true, emailVerified: true }),
    });

    // Бургер виден на узких экранах (в jsdom рендерится всегда) — открывает боковое меню.
    await user.click(screen.getByRole("button", { name: "Primary sections" }));

    // В Drawer — та же ссылка «Journeys», теперь активная (десктоп-таб тоже присутствует).
    const links = await screen.findAllByRole("link", { name: "Journeys" });
    const drawerLink = links.find((link) => link.className.includes("app-drawer-link"));
    expect(drawerLink).toHaveClass("app-drawer-link--active");
    expect(drawerLink).toHaveAttribute("aria-current", "page");
  });
});
