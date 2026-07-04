import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../../test/render";
import { JourneysPanel } from "./JourneysPanel";

describe("JourneysPanel", () => {
  it("реализованные пункты — ссылки: «Journeys map» и «+ Add journey» ведут на свои маршруты", () => {
    renderWithProviders(<JourneysPanel />);

    expect(screen.getByRole("link", { name: "Journeys map" })).toHaveAttribute("href", "/journeys");
    expect(screen.getByRole("link", { name: /Add journey/u })).toHaveAttribute(
      "href",
      "/journeys/add",
    );
  });

  it("нереализованные разделы не навигируют: не ссылки, помечены «Soon», aria-disabled", () => {
    renderWithProviders(<JourneysPanel />);

    for (const label of ["Movements map", "All journeys", "Wishlist"]) {
      // Главный инвариант патча: пункт не ссылка → в пустой маршрут не ведёт.
      expect(screen.queryByRole("link", { name: new RegExp(label, "u") })).toBeNull();
      const item = screen.getByText(label);
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveTextContent("Soon");
    }
  });

  it("«+ Add place» — отключённая кнопка с бейджем «Soon», не ссылка", () => {
    renderWithProviders(<JourneysPanel />);

    const addPlace = screen.getByRole("button", { name: /Add place/u });
    expect(addPlace).toBeDisabled();
    expect(addPlace).toHaveTextContent("Soon");
    expect(screen.queryByRole("link", { name: /Add place/u })).toBeNull();
  });
});
