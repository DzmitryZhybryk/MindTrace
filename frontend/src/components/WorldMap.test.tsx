import { fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubScreenLayout, type ScreenRect } from "../test/layout";
import { preferReducedMotion } from "../test/motion";
import { renderWithProviders, screen, waitFor } from "../test/render";
import type { MapCountry, WorldMapTone } from "./WorldMap";
import { WorldMap } from "./WorldMap";
import { WORLD_VIEW_BOX, type ViewBox } from "./worldProjection";

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
  {
    id: "RU",
    status: "visited",
    cities: [{ id: "moscow", name: "Moscow", lat: 55.75, lng: 37.62, years: [2019, 2021] }],
  },
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

  it("в тултипе города идут по году первого визита, а в одном году — по названию", async () => {
    // Алфавит и годы расходятся: York и London — 2019, Bristol — 2021.
    const countries: MapCountry[] = [
      {
        id: "GB",
        status: "visited",
        cities: [
          { id: "bristol", name: "Bristol", lat: 51.45, lng: -2.58, years: [2021] },
          { id: "york", name: "York", lat: 53.96, lng: -1.08, years: [2019, 2022] },
          { id: "london", name: "London", lat: 51.5, lng: -0.12, years: [2019] },
        ],
      },
    ];
    const { container, user } = renderWithProviders(<WorldMap countries={countries} tone={TONE} />);

    await user.hover(pathByFill(container, TONE.visited));

    const cityNames = (await screen.findAllByText(/^(London|Bristol|York)$/u)).map((element) => element.textContent);
    expect(cityNames).toEqual(["London", "York", "Bristol"]);
  });

  it("пока названия городов грузятся, тултип показывает только страну", async () => {
    const countries: MapCountry[] = [
      { id: "RU", status: "visited", cities: [{ id: "moscow", lat: 55.75, lng: 37.62, years: [2019] }] },
    ];
    const { container, user } = renderWithProviders(<WorldMap countries={countries} tone={TONE} />);

    await user.hover(pathByFill(container, TONE.visited));

    expect(await screen.findByText("Russia")).toBeInTheDocument();
    // Страна посещена — «ещё не посещено» тут было бы неправдой; годов без имени города тоже нет.
    expect(screen.queryByText("Not visited yet")).not.toBeInTheDocument();
    expect(screen.queryByText("2019")).not.toBeInTheDocument();
    // Точка города на карте есть и без названия.
    expect(container.querySelectorAll(".world-map__city-dot")).toHaveLength(1);
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

// --- Масштаб, стартовый вид и слой поверх карты ----------------------------

// SVG карты во всю область 1000×487 px: при виде на весь мир пиксель равен единице холста.
const SCREEN_RECTS: Record<string, ScreenRect> = {
  "world-map": { left: 0, top: 0, width: 1000, height: 487 },
  "world-map-canvas": { left: 0, top: 0, width: 1000, height: 487 },
  "occluder-over-map": { left: 0, top: 0, width: 400, height: 487 },
  "occluder-above-map": { left: 0, top: -300, width: 400, height: 200 },
};

// Прокрутка колеса на столько даёт ровно двукратное приближение (масштаб — exp от прокрутки).
const ZOOM_IN_TWICE_DELTA = -100 * Math.LN2;

function viewBoxOf(container: HTMLElement): ViewBox {
  const [x, y, width, height] = (container.querySelector(".world-map")?.getAttribute("viewBox") ?? "")
    .split(" ")
    .map(Number);
  return { x, y, width, height };
}

function canvasOf(container: HTMLElement): HTMLElement {
  const canvas = container.querySelector<HTMLElement>(".world-map-canvas");
  if (!canvas) {
    throw new Error("Область карты не найдена");
  }

  return canvas;
}

/** Safari присылает щипок тачпада отдельными событиями со `scale`. */
function gesture(type: string, scale: number, clientX: number, clientY: number): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), { scale, clientX, clientY });
}

interface OccludedMapProps {
  fitBounds: ViewBox;
  occluderClass: string;
  shouldFadeUnderOccluder?: boolean;
  isFitAnimated?: boolean;
}

/** Карта с панелью поверх: ref панели, как его передаёт каркас раздела. */
function OccludedMap({ fitBounds, occluderClass, shouldFadeUnderOccluder, isFitAnimated }: OccludedMapProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={panelRef} className={occluderClass} />
      <WorldMap
        countries={COUNTRIES}
        tone={TONE}
        fitBounds={fitBounds}
        occluderRef={panelRef}
        shouldFadeUnderOccluder={shouldFadeUnderOccluder}
        isFitAnimated={isFitAnimated}
      />
    </>
  );
}

describe("WorldMap: масштаб и слой поверх карты", () => {
  beforeEach(() => {
    stubScreenLayout(SCREEN_RECTS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("щипок тачпада над картой приближает только её, вокруг курсора", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);

    const isPassedToPage = fireEvent.wheel(canvasOf(container), {
      ctrlKey: true,
      deltaY: ZOOM_IN_TWICE_DELTA,
      clientX: 250,
      clientY: 100,
    });

    const view = viewBoxOf(container);
    // Страница жест не получила — масштабировать её браузеру нечего.
    expect(isPassedToPage).toBe(false);
    expect(view.width).toBeCloseTo(WORLD_VIEW_BOX.width / 2);
    // Точка под курсором (x=250 холста) осталась на своём месте экрана — на четверти ширины.
    expect((250 - view.x) / view.width).toBeCloseTo(0.25);
    expect(container.querySelector(".world-map-wrap--zoomed")).not.toBeNull();
  });

  it("обычная прокрутка над картой во весь мир достаётся странице", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);

    const isPassedToPage = fireEvent.wheel(canvasOf(container), { deltaY: 120 });

    expect(isPassedToPage).toBe(true);
    expect(viewBoxOf(container)).toEqual(WORLD_VIEW_BOX);
  });

  it("приближенную карту прокрутка двигает, а не листает страницу", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);
    const canvas = canvasOf(container);
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: ZOOM_IN_TWICE_DELTA, clientX: 500, clientY: 240 });
    const zoomed = viewBoxOf(container);

    const isPassedToPage = fireEvent.wheel(canvas, { deltaX: 40, deltaY: 20 });

    const moved = viewBoxOf(container);
    expect(isPassedToPage).toBe(false);
    // SVG на экране 1000 px, в кадре половина мира: пиксель — полединицы холста.
    expect(moved.x).toBeCloseTo(zoomed.x + 20);
    expect(moved.y).toBeCloseTo(zoomed.y + 10);
  });

  it("перетаскивание двигает приближенную карту, двойной клик возвращает весь мир", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);
    const canvas = canvasOf(container);
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: ZOOM_IN_TWICE_DELTA, clientX: 500, clientY: 240 });
    const zoomed = viewBoxOf(container);

    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: "mouse", clientX: 260, clientY: 180 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "mouse" });

    // Карту тянут за собой: курсор влево-вверх — область вправо-вниз.
    const dragged = viewBoxOf(container);
    expect(dragged.x).toBeCloseTo(zoomed.x + 20);
    expect(dragged.y).toBeCloseTo(zoomed.y + 10);

    // После отпускания движение мыши карту не двигает.
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 100 });
    expect(viewBoxOf(container)).toEqual(dragged);

    fireEvent.doubleClick(canvas);
    expect(viewBoxOf(container)).toEqual(WORLD_VIEW_BOX);
  });

  it("щипок двумя пальцами приближает карту", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);
    const canvas = canvasOf(container);

    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "touch", clientX: 400, clientY: 200 });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: "touch", clientX: 600, clientY: 200 });
    // Пальцы разошлись с 200 до 400 px — вдвое.
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: "touch", clientX: 800, clientY: 200 });

    expect(viewBoxOf(container).width).toBeCloseTo(WORLD_VIEW_BOX.width / 2);
  });

  it("щипок тачпада в Safari приближает карту и не масштабирует страницу", () => {
    const { container } = renderWithProviders(<WorldMap countries={COUNTRIES} tone={TONE} />);
    const canvas = canvasOf(container);

    fireEvent(canvas, gesture("gesturestart", 1, 500, 240));
    const change = gesture("gesturechange", 2, 500, 240);
    fireEvent(canvas, change);
    fireEvent(canvas, gesture("gestureend", 2, 500, 240));

    expect(change.defaultPrevented).toBe(true);
    expect(viewBoxOf(container).width).toBeCloseTo(WORLD_VIEW_BOX.width / 2);
  });

  it("слой поверх карты и точки городов держат экранный размер при приближении", () => {
    const { container } = renderWithProviders(
      <WorldMap
        countries={COUNTRIES}
        tone={TONE}
        overlay={(view) => <rect className="overlay-probe" width={view.width} height={view.height} />}
      />,
    );
    const probe = () => container.querySelector(".overlay-probe");
    const cityDot = () => container.querySelector(".world-map__city-dot");
    expect(probe()?.getAttribute("width")).toBe(String(WORLD_VIEW_BOX.width));
    const worldRadius = Number(cityDot()?.getAttribute("r"));

    fireEvent.wheel(canvasOf(container), { ctrlKey: true, deltaY: ZOOM_IN_TWICE_DELTA, clientX: 500, clientY: 240 });

    // Слой получает текущую область, а точка города в единицах холста вдвое меньше.
    expect(Number(probe()?.getAttribute("width"))).toBeCloseTo(WORLD_VIEW_BOX.width / 2);
    expect(Number(cityDot()?.getAttribute("r"))).toBeCloseTo(worldRadius / 2);
  });

  it("статичная карта не показывает тултип и не подсвечивает страны, но приближается", async () => {
    const { container, user } = renderWithProviders(
      <WorldMap countries={COUNTRIES} tone={TONE} isInteractive={false} />,
    );

    await user.hover(pathByFill(container, TONE.visited));

    expect(container.querySelector(".world-map__tooltip")).toBeNull();
    expect(container.querySelector(".world-map-wrap--static")).not.toBeNull();

    fireEvent.wheel(canvasOf(container), { ctrlKey: true, deltaY: ZOOM_IN_TWICE_DELTA, clientX: 500, clientY: 240 });
    expect(viewBoxOf(container).width).toBeLessThan(WORLD_VIEW_BOX.width);
  });

  it("стартовый вид приближен к содержимому и не прячет его под панелью поверх карты", () => {
    const bounds: ViewBox = { x: 400, y: 180, width: 200, height: 20 };
    const panelWidth = SCREEN_RECTS["occluder-over-map"].width;
    const leftOnScreen = (view: ViewBox) => ((bounds.x - view.x) / view.width) * SCREEN_RECTS["world-map"].width;

    const free = renderWithProviders(<OccludedMap fitBounds={bounds} occluderClass="occluder-above-map" />);
    const freeView = viewBoxOf(free.container);
    free.unmount();
    const occluded = renderWithProviders(<OccludedMap fitBounds={bounds} occluderClass="occluder-over-map" />);
    const occludedView = viewBoxOf(occluded.container);

    // Панель над картой (мобильная раскладка) ничего не закрывает: содержимое по центру кадра —
    // и его левый край пришёлся бы как раз под панель, окажись она поверх карты.
    expect(freeView.width).toBeLessThan(WORLD_VIEW_BOX.width);
    expect(freeView.x + freeView.width / 2).toBeCloseTo(bounds.x + bounds.width / 2);
    expect(leftOnScreen(freeView)).toBeLessThan(panelWidth);
    // Панель поверх левых 400 px: кадр сдвинут, левый край содержимого — правее панели.
    expect(leftOnScreen(occludedView)).toBeGreaterThan(panelWidth);

    // Двойной клик возвращает именно стартовый вид, а не весь мир.
    fireEvent.doubleClick(canvasOf(occluded.container));
    expect(viewBoxOf(occluded.container)).toEqual(occludedView);
  });

  it("новый стартовый вид не затирает масштаб, который пользователь уже выставил", () => {
    const first: ViewBox = { x: 400, y: 180, width: 200, height: 20 };
    const second: ViewBox = { x: 300, y: 160, width: 300, height: 30 };
    const { container, rerender } = renderWithProviders(
      <OccludedMap fitBounds={first} occluderClass="occluder-above-map" />,
    );

    // Нетронутый вид переезжает на новый стартовый.
    rerender(<OccludedMap fitBounds={second} occluderClass="occluder-above-map" />);
    const untouchedView = viewBoxOf(container);
    expect(untouchedView.width).toBeLessThan(WORLD_VIEW_BOX.width);

    fireEvent.wheel(canvasOf(container), { ctrlKey: true, deltaY: ZOOM_IN_TWICE_DELTA, clientX: 250, clientY: 100 });
    const zoomedView = viewBoxOf(container);
    rerender(<OccludedMap fitBounds={first} occluderClass="occluder-above-map" />);

    expect(zoomedView.width).toBeLessThan(untouchedView.width);
    expect(viewBoxOf(container)).toEqual(zoomedView);
  });

  it("карта растворяется к кромке панели поверх неё — и только когда панель действительно поверх", () => {
    const bounds: ViewBox = { x: 400, y: 180, width: 200, height: 20 };

    const over = renderWithProviders(<OccludedMap fitBounds={bounds} occluderClass="occluder-over-map" />);
    // Растворение начинается у кромки панели: закрыто ровно столько, сколько она занимает.
    expect(over.container.querySelector(".world-map-wrap--occluded")).not.toBeNull();
    expect(canvasOf(over.container).style.getPropertyValue("--map-occluded-left")).toBe(
      `${SCREEN_RECTS["occluder-over-map"].width}px`,
    );
    over.unmount();

    // Панель над картой (мобильная раскладка) ничего не закрывает — растворять нечего.
    const above = renderWithProviders(<OccludedMap fitBounds={bounds} occluderClass="occluder-above-map" />);
    expect(above.container.querySelector(".world-map-wrap--occluded")).toBeNull();
    expect(canvasOf(above.container).style.getPropertyValue("--map-occluded-left")).toBe("");
  });

  it("сквозь прозрачную панель карта видна целиком, а кадр всё равно правее панели", () => {
    const bounds: ViewBox = { x: 400, y: 180, width: 200, height: 20 };
    const faded = renderWithProviders(<OccludedMap fitBounds={bounds} occluderClass="occluder-over-map" />);
    const fadedView = viewBoxOf(faded.container);
    faded.unmount();

    const { container } = renderWithProviders(
      <OccludedMap fitBounds={bounds} occluderClass="occluder-over-map" shouldFadeUnderOccluder={false} />,
    );

    expect(container.querySelector(".world-map-wrap--occluded")).toBeNull();
    expect(canvasOf(container).style.getPropertyValue("--map-occluded-left")).toBe("");
    expect(viewBoxOf(container)).toEqual(fadedView);
  });

  it("с плавной сменой кадра карта переезжает к новому кадру, а не прыгает", async () => {
    const first: ViewBox = { x: 400, y: 180, width: 200, height: 20 };
    const second: ViewBox = { x: 100, y: 100, width: 300, height: 30 };
    const target = renderWithProviders(<OccludedMap fitBounds={second} occluderClass="occluder-above-map" />);
    const secondView = viewBoxOf(target.container);
    target.unmount();
    const { container, rerender } = renderWithProviders(
      <OccludedMap fitBounds={first} occluderClass="occluder-above-map" isFitAnimated />,
    );
    const firstView = viewBoxOf(container);

    rerender(<OccludedMap fitBounds={second} occluderClass="occluder-above-map" isFitAnimated />);

    // Сразу после смены кадр ещё старый, через кадры анимации — промежуточный, в конце — новый.
    expect(viewBoxOf(container)).toEqual(firstView);
    await waitFor(() => {
      const view = viewBoxOf(container);
      expect(view.x).not.toBe(firstView.x);
      expect(view.x).not.toBe(secondView.x);
    });
    await waitFor(() => expect(viewBoxOf(container)).toEqual(secondView));
  });

  it("при «меньше движения» новый кадр показывается сразу, без переезда", () => {
    preferReducedMotion();
    const first: ViewBox = { x: 400, y: 180, width: 200, height: 20 };
    const second: ViewBox = { x: 100, y: 100, width: 300, height: 30 };
    const target = renderWithProviders(<OccludedMap fitBounds={second} occluderClass="occluder-above-map" />);
    const secondView = viewBoxOf(target.container);
    target.unmount();
    const { container, rerender } = renderWithProviders(
      <OccludedMap fitBounds={first} occluderClass="occluder-above-map" isFitAnimated />,
    );

    rerender(<OccludedMap fitBounds={second} occluderClass="occluder-above-map" isFitAnimated />);

    expect(viewBoxOf(container)).toEqual(secondView);
  });
});
