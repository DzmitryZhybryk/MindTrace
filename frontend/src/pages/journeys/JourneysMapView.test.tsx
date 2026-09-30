import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { GEO_PLACES, server } from "../../test/handlers";
import { renderWithProviders, screen, waitFor } from "../../test/render";
import { MAP_TONE } from "./journeys-data";
import { JourneysMapView } from "./JourneysMapView";

// Точки-города — SVG <circle> без доступного имени (роль/текст недоступны, это графика),
// поэтому долёт данных до карты наблюдаем по маркеру-классу.
const CITY_DOT = ".world-map__city-dot";

const UNKNOWN_PLACE_ID = "99999999-9999-4999-8999-999999999999";

/** Карта с одной посещённой страной (RU) и заданными городами. */
function respondWithRussianCities(placeIds: string[]): void {
  server.use(
    http.get("/v1/journeys/map", () =>
      HttpResponse.json({
        countries: [
          {
            countryCode: "RU",
            cities: placeIds.map((placeId, index) => ({ placeId, latitude: 55 + index, longitude: 37, years: [2020] })),
          },
        ],
      }),
    ),
  );
}

/** Единственная посещённая страна на карте — по её заливке (SVG-path без доступного имени). */
function visitedCountry(container: HTMLElement): SVGPathElement {
  const path = container.querySelector<SVGPathElement>(`.world-map__country[fill="${MAP_TONE.visited}"]`);
  if (!path) {
    throw new Error("Посещённая страна не найдена");
  }

  return path;
}

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
          countries: [
            {
              countryCode: "RU",
              cities: [{ placeId: GEO_PLACES[0].placeId, latitude: 55.75, longitude: 37.62, years: [2020] }],
            },
          ],
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(container.querySelectorAll(CITY_DOT).length).toBeGreaterThan(0);
  });

  it("в тултипе страны — названия городов, полученные у geo", async () => {
    respondWithRussianCities([GEO_PLACES[0].placeId]);
    const { user, container } = renderWithProviders(<JourneysMapView />);
    await waitFor(() => expect(container.querySelectorAll(CITY_DOT)).toHaveLength(1));

    await user.hover(visitedCountry(container));

    expect(await screen.findByText("Moscow")).toBeInTheDocument();
  });

  it("город, которого geo не знает, подписан как неизвестный, а не пропадает", async () => {
    respondWithRussianCities([GEO_PLACES[0].placeId, UNKNOWN_PLACE_ID]);
    const { user, container } = renderWithProviders(<JourneysMapView />);
    await waitFor(() => expect(container.querySelectorAll(CITY_DOT)).toHaveLength(2));

    await user.hover(visitedCountry(container));

    expect(await screen.findByText("Moscow")).toBeInTheDocument();
    expect(await screen.findByText("Unknown place")).toBeInTheDocument();
  });

  it("под картой — атрибуция GeoNames со ссылками на источник и лицензию", () => {
    renderWithProviders(<JourneysMapView />);

    expect(screen.getByRole("link", { name: "GeoNames" })).toHaveAttribute("href", "https://www.geonames.org");
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });
});
