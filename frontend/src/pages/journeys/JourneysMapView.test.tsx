import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/handlers";
import { renderWithProviders, screen, waitFor } from "../../test/render";
import { JourneysMapView } from "./JourneysMapView";

// Точки-города — SVG <circle> без доступного имени (роль/текст недоступны, это графика),
// поэтому долёт данных до карты наблюдаем по маркеру-классу.
const CITY_DOT = ".world-map__city-dot";

describe("JourneysMapView", () => {
  it("показывает индикатор загрузки, затем рисует города на карте", async () => {
    const { container } = renderWithProviders(<JourneysMapView />);

    expect(screen.getByText("Loading your map…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading your map…")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelectorAll(CITY_DOT).length).toBeGreaterThan(0);
  });

  it("на пустом наборе поездок показывает карту без городов и без ошибки", async () => {
    server.use(http.get("/v1/journeys/map", () => HttpResponse.json({ countries: [] })));

    const { container } = renderWithProviders(<JourneysMapView />);

    await waitFor(() => {
      expect(screen.queryByText("Loading your map…")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelectorAll(CITY_DOT)).toHaveLength(0);
  });

  it("на ошибке показывает алерт, а по «Try again» успешно перезагружает карту", async () => {
    server.use(http.get("/v1/journeys/map", () => new HttpResponse(null, { status: 500 })));

    const { user, container } = renderWithProviders(<JourneysMapView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load your journeys");

    // Следующий запрос успешен → по retry алерт уходит, карта наполняется городами.
    server.use(
      http.get("/v1/journeys/map", () =>
        HttpResponse.json({
          countries: [{ countryCode: "RU", cities: [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2020] }] }],
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(container.querySelectorAll(CITY_DOT).length).toBeGreaterThan(0);
  });
});
