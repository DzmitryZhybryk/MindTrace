import { http, HttpResponse } from "msw";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emit } from "./events";
import { useAuth } from "./useAuth";
import { dismissVerifyBanner, isVerifyBannerDismissed } from "./verifyBannerStorage";
import { makeAccessToken, server } from "../test/handlers";
import { renderWithProviders, screen } from "../test/render";

/** Проба контекста: рендерит состояние auth текстом + кнопку входа для наблюдения извне. */
function AuthProbe() {
  const { isBootstrapping, isAuthenticated, emailVerified, setAccessToken } = useAuth();
  return (
    <div>
      <p>{`bootstrapping: ${isBootstrapping}`}</p>
      <p>{`authenticated: ${isAuthenticated}`}</p>
      <p>{`verified: ${emailVerified}`}</p>
      <button onClick={() => setAccessToken(makeAccessToken())}>sign in</button>
    </div>
  );
}

/** Рендерит пробу под реальным `<AuthProvider>` (bootstrap бьёт в MSW-refresh). */
function renderAuth() {
  return renderWithProviders(<AuthProbe />, { withAuthProvider: true });
}

describe("AuthProvider", () => {
  it("bootstrap без сессии (refresh 401) завершается неаутентифицированным", async () => {
    // Дефолтный handler refresh отдаёт 401 — сессии нет.
    renderAuth();

    expect(await screen.findByText("bootstrapping: false")).toBeInTheDocument();
    expect(screen.getByText("authenticated: false")).toBeInTheDocument();
  });

  it("bootstrap восстанавливает сессию (refresh 200) — аутентифицирован, claims из токена", async () => {
    server.use(
      http.post("/v1/auth/refresh/", () =>
        HttpResponse.json(
          { accessToken: makeAccessToken({ email_verified: true }) },
          { status: 200 },
        ),
      ),
    );

    renderAuth();

    expect(await screen.findByText("authenticated: true")).toBeInTheDocument();
    expect(screen.getByText("verified: true")).toBeInTheDocument();
    expect(screen.getByText("bootstrapping: false")).toBeInTheDocument();
  });

  it("событие verify-required открывает диалог подтверждения email", async () => {
    renderAuth();
    await screen.findByText("bootstrapping: false");

    act(() => emit("verify-required", undefined));

    expect(await screen.findByRole("button", { name: "Send code" })).toBeInTheDocument();
  });

  it("событие auth-required сбрасывает сессию", async () => {
    server.use(
      http.post("/v1/auth/refresh/", () =>
        HttpResponse.json({ accessToken: makeAccessToken() }, { status: 200 }),
      ),
    );
    renderAuth();
    await screen.findByText("authenticated: true");

    act(() => emit("auth-required", undefined));

    expect(await screen.findByText("authenticated: false")).toBeInTheDocument();
  });

  it("setAccessToken (вход) сбрасывает флаг скрытия verify-баннера", async () => {
    dismissVerifyBanner();
    expect(isVerifyBannerDismissed()).toBe(true);

    const { user } = renderAuth();
    await screen.findByText("bootstrapping: false");

    await user.click(screen.getByRole("button", { name: "sign in" }));

    expect(isVerifyBannerDismissed()).toBe(false);
  });
});
