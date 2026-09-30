import type { QueryClient } from "@tanstack/react-query";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getJourneysGlobeQueryKey, getJourneysMapQueryKey } from "../../api/sdk";
import { useGlobeScene } from "../../components/globe/globeScene";
import { GEO_PLACES, server } from "../../test/handlers";
import { createTestQueryClient, renderRoutes, renderWithProviders, screen, waitFor, within } from "../../test/render";
import { AddJourneyPage } from "./AddJourneyPage";
import { movementsQueryOptions } from "./movements/movementsQuery";

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

/** Монтирует AddJourneyPage на /journeys/add с landing-маркером целевого пути сабмита. */
function renderAddJourney(queryClient?: QueryClient) {
  return renderRoutes({
    element: <AddJourneyPage />,
    path: "/journeys/add",
    landings: [{ path: "/journeys", label: "journeys-landing" }],
    queryClient,
  });
}

// hidden: true — Mantine Combobox/Select-дропдаун (Popover/Floating UI) в jsdom не получает
// вычисленную позицию и остаётся display:none, поэтому опции вне видимого a11y-дерева.

/**
 * Набирает запрос в поле автокомплита и выбирает кандидата.
 *
 * Поиск опции скоупится в дропдаун ИМЕННО этого поля (по `aria-controls` инпута): Mantine
 * Combobox держит закрытый дропдаун соседнего поля в DOM (`keepMounted`), и одноимённая
 * опция оттуда иначе перехватила бы выбор (From и To с одинаковым городом).
 */
async function pickPlace(options: { user: UserEvent; label: string; query: string; option: RegExp }): Promise<void> {
  const { user, label, query, option } = options;
  const input = screen.getByLabelText(label);
  await user.type(input, query);
  const listbox = await waitFor(() => {
    const listboxId = input.getAttribute("aria-controls");
    const element = listboxId ? document.getElementById(listboxId) : null;
    if (!element) {
      throw new Error("дропдаун поля ещё не привязан");
    }
    return element;
  });
  await user.click(await within(listbox).findByRole("option", { name: option, hidden: true }));
}

/** Открывает Mantine Select по триггеру и кликает опцию по точному имени. */
async function pickOption(options: { user: UserEvent; trigger: HTMLElement; option: string }): Promise<void> {
  const { user, trigger, option } = options;
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option, hidden: true }));
}

const [MOSCOW, LONDON] = GEO_PLACES;

const UNKNOWN_PLACE_TEXT = "This place wasn't found. Pick it from the suggestions again";

/** Бэк не нашёл места с этими id — отвечает `journeys.unknown_place`. */
function respondUnknownPlaces(placeIds: string[]): void {
  server.use(
    http.post("/v1/journeys/", () =>
      HttpResponse.json(
        { code: "journeys.unknown_place", message: "ru", details: { place_ids: placeIds } },
        { status: 400 },
      ),
    ),
  );
}

/** Заполняет форму Moscow → London, самолёт, 2020 и отправляет её. */
async function submitMoscowToLondon(user: UserEvent): Promise<void> {
  await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
  await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
  await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
  await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
  await user.click(screen.getByRole("button", { name: "Add journey" }));
}

describe("AddJourneyPage", () => {
  it("создаёт поездку с id выбранных мест и ведёт в список поездок", async () => {
    let body: unknown = null;
    server.use(
      http.post("/v1/journeys/", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(body).toEqual({
      origin: { placeId: MOSCOW.placeId, countryCode: "RU", latitude: 55.75, longitude: 37.62 },
      destination: { placeId: LONDON.placeId, countryCode: "GB", latitude: 51.5, longitude: -0.12 },
      transportType: "air",
      traveledYear: 2020,
      traveledMonth: null,
      traveledDay: null,
    });
  });

  it("успешное создание помечает устаревшими карту, глобус и карту перемещений при любых фильтрах", async () => {
    server.use(http.post("/v1/journeys/", () => new HttpResponse(null, { status: 201 })));
    const queryClient = createTestQueryClient();
    // Всё уже в кэше — как после захода на вкладки перед добавлением поездки. Карта
    // перемещений — в двух вариантах: без фильтров и с окном лет.
    const filteredMovementsKey = movementsQueryOptions({ yearFrom: 2019, yearTo: 2020 }).queryKey;
    const noMovements = { firstYear: null, lastYear: null, connections: [] };
    queryClient.setQueryData(getJourneysMapQueryKey(), { countries: [] });
    queryClient.setQueryData(getJourneysGlobeQueryKey(), { places: [] });
    queryClient.setQueryData(movementsQueryOptions().queryKey, noMovements);
    queryClient.setQueryData(filteredMovementsKey, noMovements);
    const { user } = renderAddJourney(queryClient);

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(queryClient.getQueryState(getJourneysMapQueryKey())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(getJourneysGlobeQueryKey())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(movementsQueryOptions().queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(filteredMovementsKey)?.isInvalidated).toBe(true);
  });

  it("провал создания карту не трогает — инвалидировать нечего", async () => {
    server.use(http.post("/v1/journeys/", () => HttpResponse.error()));
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(getJourneysMapQueryKey(), { countries: [] });
    const { user } = renderAddJourney(queryClient);

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
    expect(queryClient.getQueryState(getJourneysMapQueryKey())?.isInvalidated).toBe(false);
  });

  it("кнопка swap меняет «откуда»/«куда» местами — в полях и в payload", async () => {
    let body: unknown = null;
    server.use(
      http.post("/v1/journeys/", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });

    await user.click(screen.getByRole("button", { name: "Swap origin and destination" }));

    // Видимый текст полей подтянулся под перевёрнутые значения формы.
    expect(screen.getByLabelText("From")).toHaveValue("London");
    expect(screen.getByLabelText("To")).toHaveValue("Moscow");

    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(body).toMatchObject({
      origin: { placeId: LONDON.placeId, countryCode: "GB" },
      destination: { placeId: MOSCOW.placeId, countryCode: "RU" },
    });
  });

  it("Enter по подсказке выбирает город и уводит фокус на поле второго города", async () => {
    const { user } = renderAddJourney();

    await user.type(screen.getByLabelText("From"), "Mos");
    await screen.findByRole("option", { name: /Moscow/iu, hidden: true });
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("From")).toHaveValue("Moscow");
    await waitFor(() => expect(screen.getByLabelText("To")).toHaveFocus());
  });

  it("Tab по открытой подсказке работает как Enter: выбор + фокус на втором городе (не на кнопке)", async () => {
    const { user } = renderAddJourney();

    await user.type(screen.getByLabelText("From"), "Mos");
    await screen.findByRole("option", { name: /Moscow/iu, hidden: true });
    await user.tab();

    expect(screen.getByLabelText("From")).toHaveValue("Moscow");
    await waitFor(() => expect(screen.getByLabelText("To")).toHaveFocus());
  });

  it("блокирует одинаковые города отправления и назначения, не отправляя запрос", async () => {
    let posted = false;
    server.use(
      http.post("/v1/journeys/", () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Mos", option: /Moscow/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("Departure and destination must differ")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it.each([
    { field: "From", other: "To" },
    { field: "To", other: "From" },
  ])("место без страны в поле $field — ошибка под полем, запрос не уходит", async ({ field, other }) => {
    const northSea = {
      placeId: "44444444-4444-4444-8444-444444444444",
      name: "North Sea",
      countryCode: null,
      latitude: 56,
      longitude: 3,
      population: null,
    };
    let posted = false;
    server.use(
      http.get("/v1/geo/places/search/", ({ request }) => {
        const query = new URL(request.url).searchParams.get("searchText") ?? "";
        return HttpResponse.json({ items: query.startsWith("Nor") ? [northSea] : [MOSCOW] });
      }),
      http.post("/v1/journeys/", () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: field, query: "Nor", option: /North Sea/iu });
    await pickPlace({ user, label: other, query: "Mos", option: /Moscow/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("This place has no country — choose a city")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("кладёт точную дату (год+месяц+день) в payload через прогрессивные чекбоксы", async () => {
    let body: unknown = null;
    server.use(
      http.post("/v1/journeys/", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    // Прогрессивное уточнение: месяц раскрывается чекбоксом, день — только после месяца.
    await user.click(screen.getByRole("checkbox", { name: "Specify month" }));
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select month"), option: "June" });
    await user.click(screen.getByRole("checkbox", { name: "Specify day" }));
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select day"), option: "15" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(body).toMatchObject({ traveledYear: 2020, traveledMonth: 6, traveledDay: 15 });
  });

  it("уточнение даты: сбрасывает невалидный день при смене месяца и поля при снятии чекбоксов", async () => {
    const { user } = renderAddJourney();

    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("checkbox", { name: "Specify month" }));
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select month"), option: "January" });
    await user.click(screen.getByRole("checkbox", { name: "Specify day" }));
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select day"), option: "31" });

    // День 31 валиден для января; смена на февраль (2020 високосный, 29 дней) сбрасывает день (clampDay).
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select month"), option: "February" });
    expect(screen.getByPlaceholderText("Select day")).toHaveValue("");

    // Снятие «Specify day» убирает поле дня; снятие «Specify month» убирает и месяц, и день.
    await user.click(screen.getByRole("checkbox", { name: "Specify day" }));
    expect(screen.queryByPlaceholderText("Select day")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Specify month" }));
    expect(screen.queryByPlaceholderText("Select month")).not.toBeInTheDocument();
  });

  it("показывает ошибку уровня формы, когда создание поездки падает", async () => {
    server.use(http.post("/v1/journeys/", () => HttpResponse.error()));
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("journeys-landing")).not.toBeInTheDocument();
  });

  it("рендерит доменную ошибку даты под полем года, а не теряет её", async () => {
    // Регресс на два бага аудита разом: (1) код journeys.* замаплен в errors-namespace
    // (иначе был бы generic fallback); (2) details.field='year' ложится на реальное поле
    // формы (раньше слался 'traveled_year' → setFieldError бил в фантомное поле, текст исчезал).
    server.use(
      http.post("/v1/journeys/", () =>
        HttpResponse.json(
          { code: "journeys.date_in_future", message: "ru", details: { field: "year" } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderAddJourney();

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("The travel date can't be in the future")).toBeInTheDocument();
    expect(screen.queryByText("journeys-landing")).not.toBeInTheDocument();
  });

  it("место, которого бэк не нашёл, подсвечивается под своим полем", async () => {
    respondUnknownPlaces([LONDON.placeId]);
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    const destinationError = await screen.findByText(UNKNOWN_PLACE_TEXT);
    expect(screen.getAllByText(UNKNOWN_PLACE_TEXT)).toHaveLength(1);
    // Ошибка стоит у поля «To» — его описание ссылается на текст ошибки.
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription(destinationError.textContent ?? "");
    expect(screen.queryByText("journeys-landing")).not.toBeInTheDocument();
  });

  it("если бэк не нашёл оба места, подсвечиваются оба поля", async () => {
    respondUnknownPlaces([MOSCOW.placeId, LONDON.placeId]);
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    await waitFor(() => expect(screen.getAllByText(UNKNOWN_PLACE_TEXT)).toHaveLength(2));
  });

  it("ненайденный id не из формы — ошибка уровня формы, а не тишина", async () => {
    respondUnknownPlaces(["99999999-9999-4999-8999-999999999999"]);
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    expect(await screen.findByText(UNKNOWN_PLACE_TEXT)).toBeInTheDocument();
    expect(screen.getByLabelText("From")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("To")).not.toHaveAccessibleDescription();
  });

  it("требует обязательные поля и не отправляет запрос при пустой форме", async () => {
    let posted = false;
    server.use(
      http.post("/v1/journeys/", () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("Choose the departure city")).toBeInTheDocument();
    expect(screen.getByText("Choose the destination city")).toBeInTheDocument();
    expect(screen.getByText("Choose a transport type")).toBeInTheDocument();
    expect(screen.getByText("Choose a year")).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});

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

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-origin", "none");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-slot", "none");
  });
});
