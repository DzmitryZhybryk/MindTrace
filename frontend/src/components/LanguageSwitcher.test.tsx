import { afterEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../i18n";
import { findMenuItem, renderWithProviders, screen, waitFor } from "../test/render";
import { LanguageSwitcher } from "./LanguageSwitcher";

describe("LanguageSwitcher", () => {
  afterEach(async () => {
    // changeLanguage меняет глобальный singleton i18n — возвращаем en для изоляции.
    await i18n.changeLanguage("en");
  });

  it("показывает текущий язык кодом (EN)", () => {
    renderWithProviders(<LanguageSwitcher />);

    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent("EN");
  });

  it("в меню перечислены все языки из реестра", async () => {
    const { user } = renderWithProviders(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: "Language" }));

    // Одним async-запросом — меню Mantine в jsdom держится открытым лишь кратко,
    // поэтому снимаем все пункты разом, а не отдельными getByRole.
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(
      expect.arrayContaining(["English", "Русский"]),
    );
  });

  it("выбор языка переключает локаль на RU", async () => {
    const { user } = renderWithProviders(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(await screen.findByRole("menuitem", { name: "Русский" }));

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("ru"));
  });

  it("клик по уже активному языку — no-op (changeLanguage не вызывается)", async () => {
    const changeSpy = vi.spyOn(i18n, "changeLanguage");
    const { user } = renderWithProviders(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(await findMenuItem("English"));

    expect(changeSpy).not.toHaveBeenCalled();
    expect(i18n.resolvedLanguage).toBe("en");
  });
});
