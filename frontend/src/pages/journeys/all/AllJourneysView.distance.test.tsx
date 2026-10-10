import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { pickPlace } from "../../../test/addJourney";
import { GEO_PLACES, server } from "../../../test/handlers";
import { openMoscowToLondonEditor } from "../../../test/journeysMap";
import { screen, waitFor } from "../../../test/render";

const [MOSCOW, , PARIS] = GEO_PLACES;

function distancePreview(): HTMLElement {
  return screen.getByText(/Distance ≈/u);
}

describe("AllJourneysView — расстояние в правке строки", () => {
  it("сохранённая пара показывает расстояние поездки без запроса", async () => {
    const distanceSpy = vi.fn();
    server.use(
      http.get("/v1/journeys/distance", () => {
        distanceSpy();
        return HttpResponse.json({ distanceKm: 1 });
      }),
    );

    await openMoscowToLondonEditor();

    expect(distancePreview()).toHaveTextContent("Distance ≈ 2,500 km");
    expect(distancePreview()).toHaveAttribute("aria-busy", "false");
    expect(distanceSpy).not.toHaveBeenCalled();
  });

  it("новая пара: пока считается — приглушённый прочерк, потом расстояние с сервера по id мест", async () => {
    // `as`: TS does not see the handler's assignment and would narrow a plain `null` init to `never`.
    let query = null as URLSearchParams | null;
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => {
      respond = resolve;
    });
    server.use(
      http.get("/v1/journeys/distance", async ({ request }) => {
        query = new URL(request.url).searchParams;
        await responded;
        return HttpResponse.json({ distanceKm: 2846 });
      }),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.clear(screen.getByLabelText("To"));
    await pickPlace({ user, label: "To", query: "Par", option: /Paris/iu });

    await waitFor(() => expect(distancePreview()).toHaveAttribute("aria-busy", "true"));
    expect(distancePreview()).toHaveTextContent("Distance ≈ —");
    respond();
    await waitFor(() => expect(distancePreview()).toHaveTextContent("Distance ≈ 2,846 km"));
    expect(distancePreview()).toHaveAttribute("aria-busy", "false");
    expect(query?.get("originPlaceId")).toBe(MOSCOW.placeId);
    expect(query?.get("destinationPlaceId")).toBe(PARIS.placeId);
  });

  it("недозаполненная пара и тот же город — прочерк, запроса нет", async () => {
    const distanceSpy = vi.fn();
    server.use(
      http.get("/v1/journeys/distance", () => {
        distanceSpy();
        return HttpResponse.json({ distanceKm: 1 });
      }),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.clear(screen.getByLabelText("To"));
    expect(distancePreview()).toHaveTextContent("Distance ≈ —");

    await pickPlace({ user, label: "To", query: "Mos", option: /Moscow/iu });
    expect(distancePreview()).toHaveTextContent("Distance ≈ —");
    expect(distancePreview()).toHaveAttribute("aria-busy", "false");
    expect(distanceSpy).not.toHaveBeenCalled();
  });

  it("ошибка расчёта — прочерк, а не число", async () => {
    server.use(
      http.get("/v1/journeys/distance", () =>
        HttpResponse.json({ code: "journeys.unknown_place", message: "ru", details: null }, { status: 400 }),
      ),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.clear(screen.getByLabelText("To"));
    await pickPlace({ user, label: "To", query: "Par", option: /Paris/iu });

    await waitFor(() => expect(distancePreview()).toHaveAttribute("aria-busy", "false"));
    expect(distancePreview()).toHaveTextContent("Distance ≈ —");
  });
});
