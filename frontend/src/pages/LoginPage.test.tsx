import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeAccessToken, server, TEST_ACCESS_TOKEN } from "../test/handlers";
import { makeAuthValue, renderRoutes, screen } from "../test/render";
import { LoginPage } from "./LoginPage";

// react-globe.gl тянет three.js/WebGL — в jsdom не рендерится и на поведение формы не влияет.
vi.mock("react-globe.gl", () => ({ default: () => null }));

/** Монтирует LoginPage на /login c landing-маркером "/" для наблюдения навигации. */
function renderLogin() {
  const authValue = makeAuthValue({ setAccessToken: vi.fn() });
  const view = renderRoutes({
    element: <LoginPage />,
    path: "/login",
    landings: [{ path: "/", label: "home-landing" }],
    authValue,
  });

  return { ...view, authValue };
}

describe("LoginPage", () => {
  it("успешный логин передаёт токен в auth и ведёт на главную", async () => {
    const { user, authValue } = renderLogin();

    await user.type(screen.getByLabelText("Username or email"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("home-landing")).toBeInTheDocument();
    expect(authValue.setAccessToken).toHaveBeenCalledWith(TEST_ACCESS_TOKEN);
  });

  it("пустые login и password дают ошибки валидации и не отправляют запрос", async () => {
    const { user, authValue } = renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your username or email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(authValue.setAccessToken).not.toHaveBeenCalled();
    expect(screen.queryByText("home-landing")).not.toBeInTheDocument();
  });

  it("неверные креды (401) показывают сообщение под полем password", async () => {
    server.use(
      http.post("/v1/auth/login/", () =>
        HttpResponse.json(
          { code: "auth.invalid_credentials", message: "русский текст бэка" },
          { status: 401 },
        ),
      ),
    );
    const { user, authValue } = renderLogin();

    await user.type(screen.getByLabelText("Username or email"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect username/email or password")).toBeInTheDocument();
    expect(authValue.setAccessToken).not.toHaveBeenCalled();
    expect(screen.queryByText("home-landing")).not.toBeInTheDocument();
  });

  it("во время запроса кнопка переходит в состояние загрузки", async () => {
    server.use(
      http.post("/v1/auth/login/", async () => {
        await delay("infinite");
        return HttpResponse.json({ accessToken: makeAccessToken(), tokenType: "bearer" });
      }),
    );
    const { user } = renderLogin();

    await user.type(screen.getByLabelText("Username or email"), "alice");
    await user.type(screen.getByLabelText("Password"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toHaveAttribute(
      "data-loading",
      "true",
    );
  });
});
