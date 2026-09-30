import { http, HttpResponse } from "msw";
import { useMemo, useRef } from "react";
import { Outlet, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WORLD_VIEW_BOX } from "../../components/worldProjection";
import { GEO_PLACES, server } from "../../test/handlers";
import { stubScreenLayout } from "../../test/layout";
import { renderWithProviders, screen, waitFor } from "../../test/render";
import type { JourneysOutletContext } from "./JourneysLayout";
import { MovementsMapView } from "./MovementsMapView";

// Дуги, точки и подписи — SVG без доступных ролей, поэтому данные на карте наблюдаем по классам.
const ARC = ".movement-line";
const DOT = ".movement-dot";

const UNKNOWN_PLACE_ID = "99999999-9999-4999-8999-999999999999";

/** Вкладка под каркасом раздела: он отдаёт ей ref панели через `<Outlet context>`. */
function MovementsTab() {
  const panelRef = useRef<HTMLElement>(null);
  const context = useMemo<JourneysOutletContext>(() => ({ panelRef }), []);
  return (
    <Routes>
      <Route element={<Outlet context={context} />}>
        <Route path="/journeys/movements" element={<MovementsMapView />} />
      </Route>
    </Routes>
  );
}

function renderMovements() {
  return renderWithProviders(<MovementsTab />, { route: "/journeys/movements" });
}

function viewBoxWidth(container: HTMLElement): number {
  return Number(container.querySelector(".world-map")?.getAttribute("viewBox")?.split(" ")[2]);
}

describe("MovementsMapView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("рисует дугу со стрелкой на каждый маршрут и точку на каждое место", async () => {
    const { container } = renderMovements();

    expect(screen.getByText("Loading your map…")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(3);
    });

    // Москва ⇄ Лондон — два маршрута, Лондон → Париж — третий; у каждого стрелка на конце.
    for (const arc of container.querySelectorAll(ARC)) {
      expect(arc.getAttribute("marker-end")).toBe("url(#movement-arrow)");
    }

    expect(container.querySelectorAll(DOT)).toHaveLength(3);
    expect(screen.queryByText("Loading your map…")).not.toBeInTheDocument();
  });

  it("подписывает места их названиями и указывает источник названий", async () => {
    renderMovements();

    for (const { name } of GEO_PLACES) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "GeoNames" })).toHaveAttribute("href", "https://www.geonames.org");
  });

  it("место, которого нет в справочнике, подписано «Unknown place»", async () => {
    const [moscow] = GEO_PLACES;
    server.use(
      http.get("/v1/journeys/movements", () =>
        HttpResponse.json({
          firstYear: 2020,
          lastYear: 2020,
          connections: [
            {
              origin: { placeId: moscow.placeId, latitude: moscow.latitude, longitude: moscow.longitude },
              destination: { placeId: UNKNOWN_PLACE_ID, latitude: 40, longitude: 20 },
            },
          ],
        }),
      ),
    );

    renderMovements();

    expect(await screen.findByText("Unknown place")).toBeInTheDocument();
    expect(screen.getByText("Moscow")).toBeInTheDocument();
  });

  it("открывается приближенной к маршрутам, а не всем миром", async () => {
    stubScreenLayout({
      "world-map": { left: 0, top: 0, width: 1000, height: 487 },
      "world-map-canvas": { left: 0, top: 0, width: 1000, height: 487 },
    });

    const { container } = renderMovements();

    await waitFor(() => {
      expect(viewBoxWidth(container)).toBeLessThan(WORLD_VIEW_BOX.width);
    });
  });

  it("без поездок показывает подсказку и пустую карту", async () => {
    server.use(
      http.get("/v1/journeys/movements", () => HttpResponse.json({ firstYear: null, lastYear: null, connections: [] })),
    );

    const { container } = renderMovements();

    expect(await screen.findByText("No journeys yet — add one and your routes will show up here")).toBeInTheDocument();
    expect(container.querySelectorAll(ARC)).toHaveLength(0);
    expect(viewBoxWidth(container)).toBe(WORLD_VIEW_BOX.width);
  });

  it("на ошибке показывает алерт, а «Try again» перезагружает маршруты", async () => {
    server.use(http.get("/v1/journeys/movements", () => new HttpResponse(null, { status: 500 })));

    const { user, container } = renderMovements();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your journeys");
    // Пустой подсказки при ошибке нет — поездки, может, и есть, их просто не удалось загрузить.
    expect(screen.queryByText(/No journeys yet/u)).not.toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(3);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
