import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GEO_PLACES, server } from "../test/handlers";
import { renderWithProviders, screen, waitFor } from "../test/render";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

// Запас поверх debounce компонента (DEBOUNCE_MS = 250): столько ждём, чтобы отложенный
// запрос успел бы уйти, если бы гард «текст равен выбранному месту» не работал.
const DEBOUNCE_SETTLE_MS = 400;

describe("PlaceAutocomplete", () => {
  it("ищет места по префиксу и кладёт выбранный PlaceResponse в onChange", async () => {
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

  it("подтягивает видимый текст при внешней смене value (swap городов в форме)", () => {
    const [moscow, london] = GEO_PLACES;
    const { rerender } = renderWithProviders(
      <PlaceAutocomplete label="From" placeholder="City" value={moscow} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("From")).toHaveValue(moscow.name);

    // Родитель поменял value не нашим onChange — поле обязано показать новое имя.
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
    // Debounce «догоняет» подставленное имя выбранного места — без гарда это был бы
    // лишний запрос, а его выдача снова открыла бы дропдаун поверх заполненного поля.
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

    // Единственный способ увидеть ОТСУТСТВИЕ запроса — дать debounce (250 мс в компоненте)
    // отработать на подставленном имени и убедиться, что счётчик не сдвинулся.
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
});
