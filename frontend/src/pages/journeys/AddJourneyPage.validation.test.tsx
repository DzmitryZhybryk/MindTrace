import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { GEO_PLACES, server } from "../../test/handlers";
import { pickOption, pickPlace, renderAddJourney } from "../../test/addJourney";
import { screen } from "../../test/render";

const [MOSCOW] = GEO_PLACES;

describe("AddJourneyPage — проверка формы до отправки", () => {
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
});
