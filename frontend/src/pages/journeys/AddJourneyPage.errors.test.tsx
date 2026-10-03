import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderAddJourney, submitMoscowToLondon } from "../../test/addJourney";
import { GEO_PLACES, server } from "../../test/handlers";
import { screen, waitFor } from "../../test/render";

const [MOSCOW, LONDON] = GEO_PLACES;

const UNKNOWN_PLACE_TEXT = "This place wasn't found. Pick it from the suggestions again";

/** The backend did not find places with these ids and answers `journeys.unknown_place`. */
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

describe("AddJourneyPage — ошибки бэка", () => {
  it("показывает ошибку уровня формы, когда создание поездки падает", async () => {
    server.use(http.post("/v1/journeys/", () => HttpResponse.error()));
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("journeys-landing")).not.toBeInTheDocument();
  });

  it("рендерит ошибку года под полем года, а не теряет её", async () => {
    // Regression for two audit bugs at once: (1) journeys.* codes are mapped in the errors namespace
    // (otherwise a generic fallback would show); (2) details.field='year' lands on the real form
    // field (it used to send 'traveled_year', so setFieldError hit a phantom field and the text vanished).
    server.use(
      http.post("/v1/journeys/", () =>
        HttpResponse.json(
          { code: "journeys.date_in_future", message: "ru", details: { field: "year" } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    expect(await screen.findByText("The travel year can't be in the future")).toBeInTheDocument();
    expect(screen.queryByText("journeys-landing")).not.toBeInTheDocument();
  });

  it("место, которого бэк не нашёл, подсвечивается под своим полем", async () => {
    respondUnknownPlaces([LONDON.placeId]);
    const { user } = renderAddJourney();

    await submitMoscowToLondon(user);

    const destinationError = await screen.findByText(UNKNOWN_PLACE_TEXT);
    expect(screen.getAllByText(UNKNOWN_PLACE_TEXT)).toHaveLength(1);
    // The error sits at the "To" field: its description references the error text.
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
});
