import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { fillMoscowToLondon, pickOption, renderAddJourney } from "../../test/addJourney";
import { server } from "../../test/handlers";
import { screen, waitFor } from "../../test/render";

describe("AddJourneyPage — поля формы", () => {
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

  it("кладёт точную дату (год+месяц+день) в payload через прогрессивные чекбоксы", async () => {
    let body: unknown = null;
    server.use(
      http.post("/v1/journeys/", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { user } = renderAddJourney();

    await fillMoscowToLondon(user);
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
});
