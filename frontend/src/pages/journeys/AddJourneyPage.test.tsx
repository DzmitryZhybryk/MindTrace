import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { getJourneysGlobeQueryKey, getJourneysMapQueryKey } from "../../api/sdk";
import { pickOption, pickPlace, renderAddJourney, submitMoscowToLondon } from "../../test/addJourney";
import { GEO_PLACES, server } from "../../test/handlers";
import { createTestQueryClient, screen } from "../../test/render";
import { movementsQueryOptions } from "./movements/movementsQuery";

// Сценарии формы разнесены по файлам (*.errors / *.validation / *.fields / *.scene): каждый
// выбор места ждёт debounce автокомплита, и в одном файле они шли бы строго последовательно.

const [MOSCOW, LONDON] = GEO_PLACES;

describe("AddJourneyPage — отправка", () => {
  it("создаёт поездку с id выбранных мест и ведёт в список поездок", async () => {
    let body: unknown = null;
    server.use(
      http.post("/v1/journeys/", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    expect(await screen.findByText("journeys-landing")).toBeInTheDocument();
    expect(body).toEqual({
      origin: { placeId: MOSCOW.placeId, countryCode: "RU", latitude: 55.75, longitude: 37.62 },
      destination: { placeId: LONDON.placeId, countryCode: "GB", latitude: 51.5, longitude: -0.12 },
      transportType: "air",
      traveledYear: 2020,
    });
  });

  it("успешное создание помечает устаревшими карту, глобус и карту перемещений при любых фильтрах", async () => {
    server.use(http.post("/v1/journeys/", () => new HttpResponse(null, { status: 201 })));
    const queryClient = createTestQueryClient();
    // Всё уже в кэше — как после захода на вкладки перед добавлением поездки. Карта
    // перемещений — в двух вариантах: без фильтра и с одним видом транспорта.
    const filteredMovementsKey = movementsQueryOptions(["air"]).queryKey;
    const noMovements = { firstYear: null, lastYear: null, connections: [] };
    queryClient.setQueryData(getJourneysMapQueryKey(), { countries: [] });
    queryClient.setQueryData(getJourneysGlobeQueryKey(), { places: [] });
    queryClient.setQueryData(movementsQueryOptions().queryKey, noMovements);
    queryClient.setQueryData(filteredMovementsKey, noMovements);
    const { user } = renderAddJourney(queryClient);

    await submitMoscowToLondon(user);

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

    await submitMoscowToLondon(user);

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
});
