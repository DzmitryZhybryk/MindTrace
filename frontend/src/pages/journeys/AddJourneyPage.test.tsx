import type { QueryClient } from "@tanstack/react-query";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { getJourneysMapQueryKey } from "../../api/sdk";
import { server } from "../../test/handlers";
import { createTestQueryClient, renderRoutes, screen, waitFor, within } from "../../test/render";
import { AddJourneyPage } from "./AddJourneyPage";

// react-globe.gl тянет three.js/WebGL — в jsdom не рендерится и на поведение формы не влияет.
vi.mock("../../components/JourneyGlobe", () => ({ JourneyGlobe: () => null }));

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

describe("AddJourneyPage", () => {
  it("создаёт поездку payload-on-create и ведёт в список поездок", async () => {
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
      origin: { name: "Moscow", countryCode: "RU", latitude: 55.75, longitude: 37.62 },
      destination: { name: "London", countryCode: "GB", latitude: 51.5, longitude: -0.12 },
      transportType: "air",
      traveledYear: 2020,
      traveledMonth: null,
      traveledDay: null,
    });
  });

  it("успешное создание помечает карту устаревшей — и 2D-карта, и глобус-фон перечитают её", async () => {
    server.use(http.post("/v1/journeys/", () => new HttpResponse(null, { status: 201 })));
    const queryClient = createTestQueryClient();
    // Карта уже в кэше — как после захода на /journeys перед добавлением поездки.
    queryClient.setQueryData(getJourneysMapQueryKey(), { countries: [] });
    const { user } = renderAddJourney(queryClient);

    await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
    await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
    await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
    await user.click(screen.getByRole("button", { name: "Add journey" }));

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(queryClient.getQueryState(getJourneysMapQueryKey())?.isInvalidated).toBe(true);
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
      origin: { name: "London", countryCode: "GB" },
      destination: { name: "Moscow", countryCode: "RU" },
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
