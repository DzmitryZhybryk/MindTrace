import { describe, expect, it } from "vitest";
import { Link, Route, Routes } from "react-router";

import { renderWithProviders, screen, waitFor } from "../test/render";
import { PublicCrossfade } from "./PublicCrossfade";

/**
 * Публичная зона в миниатюре: лейаут с кросс-фейдом и экраны-заглушки. Ссылки живут
 * ВНУТРИ экранов — навигация идёт роутером, как в приложении (`MemoryRouter` не видит
 * `window.history`, поэтому дёргать её напрямую бессмысленно).
 */
function renderZone(initialPath: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<PublicCrossfade />}>
        <Route
          path="/login"
          element={
            <div>
              screen-login
              <Link to="/signup">to-signup</Link>
            </div>
          }
        />
        <Route path="/signup" element={<div>screen-signup</div>} />
      </Route>
    </Routes>,
    { route: initialPath },
  );
}

/** Уходящий экран помечен собственным классом — по нему и опознаём. */
function leavingScreen(): HTMLElement | null {
  return document.querySelector(".public-crossfade__screen--leaving");
}

describe("PublicCrossfade", () => {
  it("на старте показывает только текущий экран, уходящего нет", () => {
    renderZone("/login");

    expect(screen.getByText("screen-login")).toBeInTheDocument();
    expect(leavingScreen()).toBeNull();
  });

  it("при навигации держит оба экрана в DOM: входящий и уходящий", async () => {
    const { user } = renderZone("/login");

    await user.click(screen.getByText("to-signup"));

    // Смысл компонента: старый экран НЕ снимается в том же кадре, а доживает фейд.
    expect(await screen.findByText("screen-signup")).toBeInTheDocument();
    await waitFor(() => expect(leavingScreen()).not.toBeNull());
    expect(screen.getByText("screen-login")).toBeInTheDocument();
  });

  it("уходящий экран помечен inert — фокус в него не проваливается", async () => {
    const { user } = renderZone("/login");

    await user.click(screen.getByText("to-signup"));

    await waitFor(() => expect(leavingScreen()).not.toBeNull());
    // Без inert ссылка внутри гаснущего экрана осталась бы в Tab-обходе.
    expect(leavingScreen()?.hasAttribute("inert")).toBe(true);
  });

  it("по истечении фейда уходящий экран снимается", async () => {
    const { user } = renderZone("/login");

    await user.click(screen.getByText("to-signup"));
    await waitFor(() => expect(leavingScreen()).not.toBeNull());

    // Таймер живёт в компоненте (задержка + длительность); ждём реального снятия.
    await waitFor(() => expect(leavingScreen()).toBeNull(), { timeout: 3000 });
    expect(screen.queryByText("screen-login")).not.toBeInTheDocument();
  });
});
