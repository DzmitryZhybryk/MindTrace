import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { AuthCard } from "./AuthCard";

describe("AuthCard", () => {
  it("рендерит заголовок, подзаголовок и вложенный контент", () => {
    renderWithProviders(
      <AuthCard title="Sign in" subtitle="Welcome back">
        <button>Submit</button>
      </AuthCard>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });
});
