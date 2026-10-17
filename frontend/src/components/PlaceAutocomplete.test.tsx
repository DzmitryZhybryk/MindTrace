import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GEO_PLACES, server } from "../test/handlers";
import { renderWithProviders, screen, waitFor } from "../test/render";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

// Margin over the component debounce (DEBOUNCE_MS = 250): how long to wait so a deferred request
// would have gone out if the "text equals the picked place" guard did not work.
const DEBOUNCE_SETTLE_MS = 400;

describe("PlaceAutocomplete", () => {
  it("ищет места по префиксу и кладёт выбранное место в onChange", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText("From"), "Mos");
    // hidden: true, because a Mantine Combobox dropdown (Popover/Floating UI) gets no computed
    // position in jsdom and stays display:none, so the option is outside the visible a11y tree.
    await user.click(await screen.findByRole("option", { name: /Moscow/iu, hidden: true }));

    expect(onChange).toHaveBeenCalledWith(GEO_PLACES[0]);
  });

  it("подтягивает видимый текст при внешней смене value (swap городов в форме)", () => {
    const [moscow, london] = GEO_PLACES;
    const { rerender } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={moscow} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("From")).toHaveValue(moscow.name);

    // The parent changed value not via our onChange: the field must show the new name.
    rerender(<PlaceAutocomplete label="From" placeholder="City" value={london} onChange={vi.fn()} />);

    expect(screen.getByLabelText("From")).toHaveValue(london.name);
  });

  it("стирание запроса ниже двух символов убирает подсказки", async () => {
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("From");

    await user.type(input, "Mos");
    await screen.findByRole("option", { name: /Moscow/iu, hidden: true });

    await user.clear(input);
    await user.type(input, "M");

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /Moscow/iu, hidden: true })).not.toBeInTheDocument();
    });
  });

  it("после выбора города повторный поиск по его же имени не уходит в сеть", async () => {
    // The debounce "catches up" with the filled-in name of the picked place; without the guard that
    // would be a needless request whose results would reopen the dropdown over a filled field.
    let requests = 0;
    server.use(
      http.get("/v1/geo/places/search/", () => {
        requests += 1;
        return HttpResponse.json({ items: GEO_PLACES.filter((place) => place.name === "Moscow") });
      }),
    );
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("From"), "Mos");
    await user.click(await screen.findByRole("option", { name: /Moscow/iu, hidden: true }));
    const afterPick = requests;

    // The only way to see the ABSENCE of a request is to let the debounce (250 ms in the component)
    // run on the filled-in name and check the counter did not move.
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

    expect(requests).toBe(afterPick);
  });

  it("показывает подсказку о пустой выдаче, когда ничего не найдено", async () => {
    server.use(http.get("/v1/geo/places/search/", () => HttpResponse.json({ items: [] })));
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText("From"), "Zzz");

    expect(
      await screen.findByText("Nothing found — try another spelling or the English name."),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("у места без страны подпись страны не показывается", async () => {
    server.use(
      http.get("/v1/geo/places/search/", () =>
        HttpResponse.json({
          items: [
            {
              placeId: "44444444-4444-4444-8444-444444444444",
              name: "Black Sea",
              countryCode: null,
              latitude: 43.4,
              longitude: 34.3,
              population: null,
            },
            GEO_PLACES[0],
          ],
        }),
      ),
    );
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("From"), "Bl");

    const sea = await screen.findByRole("option", { name: "Black Sea", hidden: true });
    // A sea's option has only the name; a city's has name and country.
    expect(sea).toHaveTextContent(/^Black Sea$/u);
    expect(screen.getByRole("option", { name: /Moscow/iu, hidden: true })).toHaveTextContent("Russia");
  });
});
