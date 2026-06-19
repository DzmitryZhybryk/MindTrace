import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GEO_PLACES, server } from "../test/handlers";
import { renderWithProviders, screen } from "../test/render";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

describe("PlaceAutocomplete", () => {
  it("ищет места по префиксу и кладёт выбранный PlaceSuggestion в onChange", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={null} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText("From"), "Mos");
    // hidden: true — Mantine Combobox-дропдаун (Popover/Floating UI) в jsdom не получает
    // вычисленную позицию и остаётся display:none, поэтому опция вне видимого a11y-дерева.
    await user.click(await screen.findByRole("option", { name: /Moscow/iu, hidden: true }));

    expect(onChange).toHaveBeenCalledWith(GEO_PLACES[0]);
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
});
