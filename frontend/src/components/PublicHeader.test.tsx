import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { PublicHeader } from "./PublicHeader";

describe("PublicHeader", () => {
  it("на лендинге акцентная пилюля — регистрация", () => {
    renderWithProviders(<PublicHeader />, { route: "/" });

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Log in" })).not.toHaveClass("is-active");
  });

  it("на /login акцент переходит на вход", () => {
    renderWithProviders(<PublicHeader />, { route: "/login" });

    expect(screen.getByRole("link", { name: "Log in" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Sign up" })).not.toHaveClass("is-active");
  });

  it("логотип ведёт на корень публичной зоны", () => {
    renderWithProviders(<PublicHeader />, { route: "/signup" });

    expect(screen.getByRole("link", { name: "MyJourney" })).toHaveAttribute("href", "/");
  });
});
