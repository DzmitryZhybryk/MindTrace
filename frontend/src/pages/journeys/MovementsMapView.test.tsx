import { fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useMemo, useRef } from "react";
import { Outlet, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WORLD_VIEW_BOX } from "../../components/worldProjection";
import { GEO_PLACES, MOVEMENTS_RESPONSE, server } from "../../test/handlers";
import { stubScreenLayout } from "../../test/layout";
import { act, renderWithProviders, screen, waitFor } from "../../test/render";
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

/** Записывает query-строки запросов карты перемещений и отвечает фикстурой без фильтра. */
function recordMovementsRequests(): string[] {
  const queries: string[] = [];
  server.use(
    http.get("/v1/journeys/movements", ({ request }) => {
      queries.push(new URL(request.url).searchParams.toString());
      return HttpResponse.json(MOVEMENTS_RESPONSE);
    }),
  );
  return queries;
}

/** Ждёт, пока на карте появятся все три маршрута фикстуры. */
async function waitForAllRoutes(container: HTMLElement): Promise<void> {
  await waitFor(() => {
    expect(container.querySelectorAll(ARC)).toHaveLength(3);
  });
}

describe("MovementsMapView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("рисует дугу со стрелкой на каждый маршрут и точку на каждое место", async () => {
    const { container } = renderMovements();

    expect(screen.getByText("Loading your map…")).toBeInTheDocument();
    await waitForAllRoutes(container);

    // Москва ⇄ Лондон — два маршрута, Лондон → Париж — третий; у каждого стрелка на конце.
    for (const arc of container.querySelectorAll(ARC)) {
      expect(arc.getAttribute("marker-end")).toBe("url(#movement-arrow)");
    }

    expect(container.querySelectorAll(DOT)).toHaveLength(3);
    expect(screen.queryByText("Loading your map…")).not.toBeInTheDocument();
  });

  it("дуга через край мира — два куска, гаснущих у разреза, стрелка только на втором", async () => {
    // Токио → Лос-Анджелес: кратчайший путь идёт через Тихий океан, через 180-й меридиан.
    server.use(
      http.get("/v1/journeys/movements", () =>
        HttpResponse.json({
          firstYear: 2020,
          lastYear: 2020,
          connections: [
            {
              origin: { placeId: GEO_PLACES[0].placeId, latitude: 35.69, longitude: 139.69 },
              destination: { placeId: GEO_PLACES[1].placeId, latitude: 34.05, longitude: -118.24 },
              years: [2020],
            },
          ],
        }),
      ),
    );

    const { container } = renderMovements();

    // У каждого куска — хвост у разреза, гаснущий градиентом, и сплошная остальная часть.
    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(4);
    });
    const arcs = [...container.querySelectorAll<SVGPathElement>(ARC)];
    const fading = arcs.filter((arc) => arc.style.stroke.startsWith("url("));
    expect(fading).toHaveLength(2);
    expect(container.querySelectorAll("linearGradient")).toHaveLength(2);
    // Стрелка одна — в конце сплошной части второго куска, у точки назначения.
    const withArrow = arcs.filter((arc) => arc.getAttribute("marker-end") === "url(#movement-arrow)");
    expect(withArrow).toEqual([arcs[3]]);
    expect(arcs[3].style.stroke).toBe("");
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
              years: [2020],
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

    await waitForAllRoutes(container);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("по умолчанию показывает все годы и все виды транспорта", async () => {
    renderMovements();

    expect(await screen.findByRole("button", { name: "From year" })).toHaveTextContent("2019");
    expect(screen.getByRole("button", { name: "To year" })).toHaveTextContent("2022");
    for (const transport of ["Land", "Air", "Water"]) {
      expect(screen.getByRole("checkbox", { name: transport })).toBeChecked();
    }
  });

  it("окно лет фильтрует маршруты на клиенте — без запросов", async () => {
    const queries = recordMovementsRequests();
    const { user, container } = renderMovements();
    await waitForAllRoutes(container);
    const toYear = screen.getByRole("slider", { name: "To year" });

    // Фокус — как с клавиатуры (Tab): клик в jsdom запустил бы перетаскивание по дорожке нулевой ширины.
    act(() => toYear.focus());
    await user.keyboard("{ArrowLeft}");

    // Окно 2019–2021: Лондон → Париж (2022) пропал, Москва ⇄ Лондон остались.
    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(2);
    });
    expect(screen.getByRole("button", { name: "To year" })).toHaveTextContent("2021");
    expect(queries).toEqual([""]);
  });

  it("карта меняется прямо во время перетаскивания ползунка, до отпускания кнопки", async () => {
    // Дорожка ползунка 300 px: 2019 — у левого края, 2022 — у правого, год — 100 px.
    stubScreenLayout({ "mantine-RangeSlider-trackContainer": { left: 0, top: 0, width: 300, height: 20 } });
    const queries = recordMovementsRequests();
    const { container } = renderMovements();
    await waitForAllRoutes(container);
    const track = container.querySelector(".mantine-RangeSlider-trackContainer");
    if (!track) {
      throw new Error("Дорожка ползунка не найдена");
    }

    // Захватили правый ползунок и тянем влево на год — кнопку не отпускаем.
    fireEvent.mouseDown(track, { clientX: 300, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 10 });

    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(2);
    });
    expect(queries).toEqual([""]);

    fireEvent.mouseUp(document);
  });

  it("вписанный год переставляет ручку, а год за пределами встаёт на границу", async () => {
    const { user, container } = renderMovements();
    await waitForAllRoutes(container);

    await user.click(screen.getByRole("button", { name: "From year" }));
    await user.clear(screen.getByRole("textbox", { name: "From year" }));
    await user.type(screen.getByRole("textbox", { name: "From year" }), "2021{Enter}");

    // Окно 2021–2022: Лондон → Москва (2020) пропал.
    await waitFor(() => {
      expect(container.querySelectorAll(ARC)).toHaveLength(2);
    });
    expect(screen.getByRole("button", { name: "From year" })).toHaveTextContent("2021");

    // 200 — меньше первого года шкалы: левая граница встаёт на 2019.
    await user.click(screen.getByRole("button", { name: "From year" }));
    await user.clear(screen.getByRole("textbox", { name: "From year" }));
    await user.type(screen.getByRole("textbox", { name: "From year" }), "200{Enter}");

    expect(await screen.findByRole("button", { name: "From year" })).toHaveTextContent("2019");
    await waitForAllRoutes(container);
  });

  it("левый год нельзя вписать правее правого — он встаёт вровень с ним", async () => {
    const { user, container } = renderMovements();
    await waitForAllRoutes(container);
    const toYear = screen.getByRole("slider", { name: "To year" });
    act(() => toYear.focus());
    await user.keyboard("{ArrowLeft}{ArrowLeft}");

    await user.click(screen.getByRole("button", { name: "From year" }));
    await user.clear(screen.getByRole("textbox", { name: "From year" }));
    await user.type(screen.getByRole("textbox", { name: "From year" }), "2022{Enter}");

    expect(await screen.findByRole("button", { name: "From year" })).toHaveTextContent("2020");
  });

  it("Escape и пустое поле оставляют прежний год", async () => {
    const { user, container } = renderMovements();
    await waitForAllRoutes(container);

    await user.click(screen.getByRole("button", { name: "To year" }));
    await user.type(screen.getByRole("textbox", { name: "To year" }), "{Backspace}0{Escape}");
    expect(await screen.findByRole("button", { name: "To year" })).toHaveTextContent("2022");

    await user.click(screen.getByRole("button", { name: "To year" }));
    await user.clear(screen.getByRole("textbox", { name: "To year" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: "To year" })).toHaveTextContent("2022");
  });

  it("снятый вид транспорта убирает его из запроса, а без транспорта карта пуста и запроса нет", async () => {
    const queries = recordMovementsRequests();
    const { user, container } = renderMovements();
    await waitForAllRoutes(container);

    await user.click(screen.getByRole("checkbox", { name: "Water" }));
    await waitFor(() => {
      expect(queries.at(-1)).toBe("transportType=air&transportType=land");
    });

    await user.click(screen.getByRole("checkbox", { name: "Air" }));
    await user.click(screen.getByRole("checkbox", { name: "Land" }));

    expect(await screen.findByText("Choose at least one transport")).toBeInTheDocument();
    expect(container.querySelectorAll(ARC)).toHaveLength(0);
    // Ни один запрос не ушёл без фильтра транспорта.
    expect(queries.filter((query) => query.includes("transportType="))).toEqual([
      "transportType=air&transportType=land",
      "transportType=land",
    ]);
  });

  it("засечки лет не теснее 10 px: за полвека на узком ползунке — через год, а не каждый год", async () => {
    server.use(
      http.get("/v1/journeys/movements", () =>
        HttpResponse.json({ ...MOVEMENTS_RESPONSE, firstYear: 1976, lastYear: 2026 }),
      ),
    );
    // Ползунок 300 px на 50 лет — около 6 px на год: засечка каждый год слиплась бы в бусы.
    stubScreenLayout({ "movements-controls__slider": { left: 0, top: 0, width: 300, height: 30 } });

    const { container } = renderMovements();

    await screen.findByRole("slider", { name: "To year" });
    // Шаг 2 года: чётные годы с 1976 по 2026 — 26 засечек вместо 51.
    await waitFor(() => {
      expect(container.querySelectorAll(".mantine-RangeSlider-mark")).toHaveLength(26);
    });
  });

  it("поездки одного года — подпись года без ползунка", async () => {
    server.use(
      http.get("/v1/journeys/movements", () =>
        HttpResponse.json({ ...MOVEMENTS_RESPONSE, firstYear: 2020, lastYear: 2020 }),
      ),
    );

    renderMovements();

    expect(await screen.findByText("2020")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
