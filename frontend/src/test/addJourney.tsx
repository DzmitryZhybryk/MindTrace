import type { QueryClient } from "@tanstack/react-query";
import type { UserEvent } from "@testing-library/user-event";

import { AddJourneyPage } from "../pages/journeys/AddJourneyPage";
import { renderRoutes, screen, waitFor, within } from "./render";

/** Монтирует AddJourneyPage на /journeys/add с landing-маркером целевого пути сабмита. */
export function renderAddJourney(queryClient?: QueryClient) {
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
export async function pickPlace(options: {
  user: UserEvent;
  label: string;
  query: string;
  option: RegExp;
}): Promise<void> {
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
export async function pickOption(options: { user: UserEvent; trigger: HTMLElement; option: string }): Promise<void> {
  const { user, trigger, option } = options;
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option, hidden: true }));
}

/** Заполняет форму Moscow → London, самолёт, 2020 — без отправки. */
export async function fillMoscowToLondon(user: UserEvent): Promise<void> {
  await pickPlace({ user, label: "From", query: "Mos", option: /Moscow/iu });
  await pickPlace({ user, label: "To", query: "Lon", option: /London/iu });
  await pickOption({ user, trigger: screen.getByPlaceholderText("Choose transport"), option: "Air" });
  await pickOption({ user, trigger: screen.getByPlaceholderText("Select year"), option: "2020" });
}

/** Заполняет форму Moscow → London, самолёт, 2020 и отправляет её. */
export async function submitMoscowToLondon(user: UserEvent): Promise<void> {
  await fillMoscowToLondon(user);
  await user.click(screen.getByRole("button", { name: "Add journey" }));
}
