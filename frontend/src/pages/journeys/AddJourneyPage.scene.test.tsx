import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGlobeScene } from "../../components/globe/globeScene";
import { pickOption, pickPlace, submitMoscowToLondon } from "../../test/addJourney";
import { server } from "../../test/handlers";
import { renderWithProviders, screen } from "../../test/render";
import { AddJourneyPage } from "./AddJourneyPage";

/**
 * Зонд канала сцены — то, что на проде читает `PersistentGlobeHost`. Стоит ВНЕ роутов, чтобы
 * пережить уход со страницы и показать, что она за собой убрала.
 */
function SceneProbe() {
  const { route, slot } = useGlobeScene();
  return (
    <output
      data-testid="scene"
      data-origin={route?.origin?.name ?? "none"}
      data-destination={route?.destination?.name ?? "none"}
      data-transport={route?.transportType ?? "none"}
      data-slot={slot ? `${slot.left},${slot.top},${slot.width},${slot.height}` : "none"}
    />
  );
}

/** Форма на /journeys/add и зонд сцены рядом; сабмит уводит на /journeys. */
function renderWithSceneProbe() {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/journeys/add" element={<AddJourneyPage />} />
        <Route path="/journeys" element={<div>journeys-landing</div>} />
      </Routes>
      <SceneProbe />
    </>,
    { route: "/journeys/add" },
  );
}

describe("AddJourneyPage — сцена глобуса", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("публикует глобусу маршрут по мере заполнения формы", async () => {
    const { user } = renderWithSceneProbe();
    const scene = screen.getByTestId("scene");

    expect(scene).toHaveAttribute("data-origin", "none");

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });

    expect(scene).toHaveAttribute("data-origin", "Moscow");
    expect(scene).toHaveAttribute("data-destination", "London");
    expect(scene).toHaveAttribute("data-transport", "air");
  });

  it("публикует прямоугольник колонки глобуса во viewport-координатах", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 700, y: 100, width: 300, height: 600 }),
    );

    renderWithSceneProbe();

    expect(screen.getByTestId("scene")).toHaveAttribute("data-slot", "700,100,300,600");
  });

  it("колонка нулевого размера (узкий экран, display:none) — места под глобус нет", () => {
    // jsdom не верстает: rect любого элемента нулевой — ровно как у скрытой колонки.
    renderWithSceneProbe();

    expect(screen.getByTestId("scene")).toHaveAttribute("data-slot", "none");
  });

  it("уход со страницы снимает маршрут и колонку — глобусу больше нечего показывать", async () => {
    server.use(http.post("/v1/journeys/", () => new HttpResponse(null, { status: 201 })));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 700, y: 100, width: 300, height: 600 }),
    );
    const { user } = renderWithSceneProbe();

    await submitMoscowToLondon(user);

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-origin", "none");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-slot", "none");
  });
});
