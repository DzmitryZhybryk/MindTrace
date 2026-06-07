import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server, TEST_ACCESS_TOKEN } from "../test/handlers";
import { makeAuthValue, renderRoutes, screen } from "../test/render";
import { SignUpPage } from "./SignUpPage";

// react-globe.gl тянет three.js/WebGL — в jsdom не рендерится и на поведение формы не влияет.
vi.mock("react-globe.gl", () => ({ default: () => null }));

/** Монтирует SignUpPage на /signup c landing-маркером "/" для наблюдения навигации. */
function renderSignup() {
  const authValue = makeAuthValue({ setAccessToken: vi.fn() });
  const view = renderRoutes({
    element: <SignUpPage />,
    path: "/signup",
    landings: [{ path: "/", label: "home-landing" }],
    authValue,
  });

  return { ...view, authValue };
}

const termsCheckbox = { name: /I agree to the/ };

describe("SignUpPage", () => {
  it("валидная регистрация передаёт токен в auth и ведёт на главную", async () => {
    const { user, authValue } = renderSignup();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "s3cret-pass");
    await user.click(screen.getByRole("checkbox", termsCheckbox));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("home-landing")).toBeInTheDocument();
    expect(authValue.setAccessToken).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
  });

  it("кнопка отправки заблокирована, пока не приняты условия", async () => {
    const { user } = renderSignup();

    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", termsCheckbox));

    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("невалидные поля дают сообщения под полями и не отправляют запрос", async () => {
    const { user, authValue } = renderSignup();

    await user.click(screen.getByRole("checkbox", termsCheckbox));
    await user.type(screen.getByLabelText("Username"), "ab");
    await user.type(screen.getByLabelText("Email"), "nope");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Username must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(authValue.setAccessToken).not.toHaveBeenCalled();
  });

  it("конфликт email (409) показывает ошибку под полем Email", async () => {
    server.use(
      http.post("/v1/auth/register/", () =>
        HttpResponse.json(
          {
            code: "auth.email_already_registered",
            message: "русский текст бэка",
            details: { field: "email" },
          },
          { status: 409 },
        ),
      ),
    );
    const { user, authValue } = renderSignup();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.type(screen.getByLabelText("Password"), "s3cret-pass");
    await user.click(screen.getByRole("checkbox", termsCheckbox));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("This email is already registered")).toBeInTheDocument();
    expect(authValue.setAccessToken).not.toHaveBeenCalled();
    expect(screen.queryByText("home-landing")).not.toBeInTheDocument();
  });

  it("конфликт username (409) показывает ошибку под полем Username", async () => {
    server.use(
      http.post("/v1/auth/register/", () =>
        HttpResponse.json(
          {
            code: "auth.username_already_taken",
            message: "русский текст бэка",
            details: { field: "username" },
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderSignup();

    await user.type(screen.getByLabelText("Username"), "taken");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "s3cret-pass");
    await user.click(screen.getByRole("checkbox", termsCheckbox));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("This username is already taken")).toBeInTheDocument();
  });
});
