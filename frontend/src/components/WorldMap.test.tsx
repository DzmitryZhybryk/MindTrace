import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import type { MapCountry, WorldMapTone } from "./WorldMap";
import { WorldMap } from "./WorldMap";

// Уникальные заливки на статус: по fill однозначно находим path нужной страны
// (роль/имя у SVG-path недоступны — это графика).
const TONE: WorldMapTone = {
  land: "#eeeeee",
  border: "#999999",
  visited: "#00cc44",
  wishlist: "#ffaa00",
  cityDot: "#ff3366",
};

const COUNTRIES: MapCountry[] = [
  { id: "RU", status: "visited", cities: [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2019, 2021] }] },
  { id: "FR", status: "wishlist", cities: [] },
];

function pathByFill(container: HTMLElement, fill: string): SVGPathElement {
  const path = container.querySelector<SVGPathElement>(`.world-map__country[fill="${fill}"]`);
  if (!path) {
    throw new Error(`Страна с заливкой ${fill} не найдена`);
  }

  return path;
}

describe("WorldMap", () => {
  it("рисует страны по статусу и точки городов", () => {
    const { container } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} className="test-map" />,
    );

    // Посещённая и wishlist-страны получают свои заливки, остальные — land.
    expect(container.querySelector(`.world-map__country[fill="${TONE.visited}"]`)).not.toBeNull();
    expect(container.querySelector(`.world-map__country[fill="${TONE.wishlist}"]`)).not.toBeNull();
    expect(container.querySelectorAll(`.world-map__country[fill="${TONE.land}"]`).length).toBeGreaterThan(0);
    // Город посещённой страны — одна точка.
    expect(container.querySelectorAll(".world-map__city-dot")).toHaveLength(1);
    // Доступное имя карты и внешний класс-модификатор.
    expect(container.querySelector(".world-map")?.getAttribute("aria-label")).toBe(
      "World map highlighting visited countries",
    );
    expect(container.querySelector(".world-map-wrap.test-map")).not.toBeNull();
  });

  it("без className не добавляет модификатор-класс", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);

    expect(container.querySelector(".world-map-wrap")?.getAttribute("class")).toBe("world-map-wrap");
  });

  it("ховер посещённой страны показывает тултип с городами и годами", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} />,
    );

    await user.hover(pathByFill(container, TONE.visited));

    // Имя резолвится из ISO-кода через CLDR (RU → Russia), города — с годами визитов.
    expect(await screen.findByText("Russia")).toBeInTheDocument();
    expect(screen.getByText("Moscow")).toBeInTheDocument();
    expect(screen.getByText("2019, 2021")).toBeInTheDocument();
  });

  it("ховер страны из wishlist показывает подпись из списка желаний", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} />,
    );

    await user.hover(pathByFill(container, TONE.wishlist));

    expect(await screen.findByText("France")).toBeInTheDocument();
    expect(screen.getByText("On your wishlist")).toBeInTheDocument();
  });

  it("территория без ISO-кода (Northern Cyprus) показывает имя из geojson", async () => {
    // Единственная wishlist-страна → находим её path по уникальной заливке.
    const { container, user } = renderWithProviders(
      <WorldMap countries={[{ id: "Northern Cyprus", status: "wishlist", cities: [] }]} tone={TONE} />,
    );

    await user.hover(pathByFill(container, TONE.wishlist));

    // id не вида ISO alpha-2 → имя резолвится не через CLDR, а из geojson (COUNTRY_NAMES).
    expect(await screen.findByText("Northern Cyprus")).toBeInTheDocument();
  });

  it("ховер непосещённой страны показывает «ещё не посещено»", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} />,
    );

    // Любая страна вне пропсов countries → статус land → muted «ещё не посещено».
    const landPath = container.querySelector<SVGPathElement>(`.world-map__country[fill="${TONE.land}"]`);
    if (!landPath) {
      throw new Error("Непосещённая страна не найдена");
    }
    await user.hover(landPath);

    expect(await screen.findByText("Not visited yet")).toBeInTheDocument();
  });

  it("у края экрана тултип отражается к курсору (flip)", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} />,
    );

    await user.hover(pathByFill(container, TONE.visited));
    const wrap = container.querySelector<HTMLDivElement>(".world-map-wrap");
    if (!wrap) {
      throw new Error("Обёртка карты не найдена");
    }
    const tooltip = container.querySelector<HTMLDivElement>(".world-map__tooltip");
    if (!tooltip) {
      throw new Error("Тултип не найден");
    }

    // Далеко за правым/нижним краем viewport → тултип отражается к курсору (calc(-100%)).
    fireEvent.mouseMove(wrap, { clientX: 5000, clientY: 5000 });
    expect(tooltip.style.transform).toContain("calc(-100%");

    // Ближе к началу координат → обычное смещение на offset, без отражения (нет calc()).
    fireEvent.mouseMove(wrap, { clientX: 5, clientY: 5 });
    expect(tooltip.style.transform).not.toContain("calc(");
  });

  it("увод курсора со страны убирает тултип", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} />,
    );

    const visited = pathByFill(container, TONE.visited);
    await user.hover(visited);
    expect(container.querySelector(".world-map__tooltip")).not.toBeNull();

    await user.unhover(visited);
    expect(container.querySelector(".world-map__tooltip")).toBeNull();
  });
});
