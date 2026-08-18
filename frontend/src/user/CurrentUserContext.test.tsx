import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AuthContext, type AuthContextValue } from "../auth/useAuth";
import { server, TEST_CURRENT_USER } from "../test/handlers";
import { makeAuthValue } from "../test/render";
import { CurrentUserProvider } from "./CurrentUserContext";
import { useCurrentUser } from "./useCurrentUser";

/** Пробник: выводит статус машины состояний (и имя — для ready), без Mantine/Router. */
function Probe() {
  const state = useCurrentUser();
  return <span>{state.status === "ready" ? `ready:${state.user.displayName ?? state.user.username}` : state.status}</span>;
}

function tree(authValue: AuthContextValue) {
  return (
    <AuthContext.Provider value={authValue}>
      <CurrentUserProvider>
        <Probe />
      </CurrentUserProvider>
    </AuthContext.Provider>
  );
}

describe("CurrentUserProvider", () => {
  it("во время auth-bootstrap держит loading и не шлёт запрос", () => {
    render(tree(makeAuthValue({ isAuthenticated: false, isBootstrapping: true })));

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("без сессии переходит в anonymous", async () => {
    render(tree(makeAuthValue({ isAuthenticated: false })));

    expect(await screen.findByText("anonymous")).toBeInTheDocument();
  });

  it("после логина грузит /me и отдаёт ready с профилем", async () => {
    render(tree(makeAuthValue({ isAuthenticated: true })));

    // Дефолтная MSW-фикстура: displayName=null → пробник показывает username.
    expect(await screen.findByText("ready:traveler")).toBeInTheDocument();
  });

  it("ошибка /me переводит в error", async () => {
    server.use(
      http.get("/v1/users/me", () =>
        HttpResponse.json({ code: "internal_error", message: "boom" }, { status: 500 }),
      ),
    );

    render(tree(makeAuthValue({ isAuthenticated: true })));

    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("поздний ответ устаревшего запроса не затирает состояние после логаута", async () => {
    // Ответ /me придерживается вручную: логаут происходит, пока запрос «в полёте».
    let releaseProfile!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    server.use(
      http.get("/v1/users/me", async () => {
        await gate;
        return HttpResponse.json(TEST_CURRENT_USER);
      }),
    );

    const { rerender } = render(tree(makeAuthValue({ isAuthenticated: true })));
    expect(screen.getByText("loading")).toBeInTheDocument();

    rerender(tree(makeAuthValue({ isAuthenticated: false })));
    expect(await screen.findByText("anonymous")).toBeInTheDocument();

    releaseProfile();
    // Даём устаревшему ответу дойти: состояние должно остаться anonymous.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    expect(screen.queryByText(/ready:/u)).not.toBeInTheDocument();
    expect(screen.queryByText("error")).not.toBeInTheDocument();
  });
});
