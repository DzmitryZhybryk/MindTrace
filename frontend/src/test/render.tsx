/**
 * Кастомный `render` с провайдерами приложения — единая точка для всех
 * component-тестов (аналог backend-фикстуры «service-under-test на фейках»).
 *
 * Поднимает `MantineProvider` (тема приложения) + `MemoryRouter` (Link/Navigate/
 * useNavigate требуют Router-предка). Auth-состояние подаётся одним из двух путей:
 *  - `authValue` — stub `AuthContext.Provider` с контролируемым value (для
 *    компонентов, которым нужно фиксированное `{emailVerified, isAuthenticated…}`
 *    без поднятия реального bootstrap'а: HomePage, ProtectedRoute);
 *  - `withAuthProvider` — реальный `<AuthProvider>` (для страниц, где проверяем
 *    сам флоу `setAccessToken` → навигация: LoginPage, SignUpPage).
 *
 * Навигацию наблюдаем «как пользователь»: `renderRoutes` монтирует компонент на
 * его пути и добавляет landing-маркеры для целевых путей — после `navigate("/")`
 * в DOM появляется текст landing'а. `useNavigate` при этом не мокается.
 */

import { useState, type ReactElement, type ReactNode } from "react";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { AuthContext, type AuthContextValue } from "../auth/useAuth";
import { theme } from "../theme";
import { CurrentUserProvider } from "../user/CurrentUserContext";

/**
 * Query-клиент для одного теста — с боевыми дефолтами он был бы источником флака.
 *
 * `retry: false` — иначе кейс «запрос упал» ждал бы три повтора с backoff'ом и
 * упирался в таймаут вместо того, чтобы показать ошибку. `refetchOnWindowFocus: false`
 * — jsdom шлёт focus по ходу `userEvent`, и фоновый рефетч бил бы по MSW уже после
 * `server.resetHandlers()`. Кэш свежий на каждый рендер: состояние между кейсами не течёт.
 *
 * Returns:
 *     Изолированный `QueryClient` для одного дерева.
 */
export function createTestQueryClient(queries: DefaultOptions["queries"] = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, ...queries },
    },
  });
}

type AuthOptions = {
  /** Stub-значение контекста; имеет приоритет над `withAuthProvider`. */
  authValue?: AuthContextValue;
  /** Обернуть в реальный `<AuthProvider>` (если `authValue` не задан). */
  withAuthProvider?: boolean;
  /**
   * Свой Query-клиент вместо дефолтного — когда тест смотрит на кэш снаружи дерева
   * (инвалидация, очистка на разлогине) или меняет политику повторов.
   */
  queryClient?: QueryClient;
};

type ProvidersProps = AuthOptions & {
  children: ReactNode;
  initialPath: string;
};

function Providers({ children, initialPath, authValue, withAuthProvider, queryClient }: ProvidersProps) {
  // Клиент фиксируется на монтирование дерева: `rerender` в тесте не должен сбрасывать
  // кэш вместе с ним.
  const [client] = useState(() => queryClient ?? createTestQueryClient());

  // Реальный CurrentUserProvider в обоих auth-режимах (сеть закрывает MSW-handler
  // `/v1/users/me`); в default-ветке его нет — без Auth-предка useAuth внутри бросит.
  let withAuth: ReactNode = children;
  if (authValue !== undefined) {
    withAuth = (
      <AuthContext.Provider value={authValue}>
        <CurrentUserProvider>{children}</CurrentUserProvider>
      </AuthContext.Provider>
    );
  } else if (withAuthProvider) {
    withAuth = (
      <AuthProvider>
        <CurrentUserProvider>{children}</CurrentUserProvider>
      </AuthProvider>
    );
  }

  return (
    // Схема — "dark", как в `main.tsx`. Раньше здесь стояло "light", и это было НЕ
    // мелочью: на `main` обе стороны были светлыми, редизайн перевёл прод на тёмную, а
    // тесты остались на светлой — то есть весь редизайн проверялся в противоположной
    // схеме. Именно поэтому 207 зелёных тестов пропустили заголовок с контрастом 1.29:1
    // и белую метку кнопки на светлом акценте: гейт физически не мог их увидеть.
    //
    // env="test" отключает Mantine-transitions и порталы: дропдаун Menu/Modal
    // монтируется синхронно при открытии, без таймеров анимации. Без этого Menu в
    // jsdom флапает — открывается и закрывается посреди асинхронной цепочки
    // userEvent, и `findAllByRole("menuitem")` периодически таймаутит.
    <MantineProvider theme={theme} defaultColorScheme="dark" env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>{withAuth}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

type RenderOptions = AuthOptions & {
  /** Стартовый путь MemoryRouter (по умолчанию "/"). */
  route?: string;
};

/**
 * Рендерит произвольный UI в провайдерах. Возвращает `user` (готовый
 * `userEvent.setup()`) поверх стандартного `RenderResult`.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions = {},
): RenderResult & { user: UserEvent } {
  const { route = "/", ...auth } = options;
  const result = render(ui, {
    wrapper: ({ children }) => (
      <Providers initialPath={route} {...auth}>
        {children}
      </Providers>
    ),
  });

  return { ...result, user: userEvent.setup() };
}

type Landing = {
  /** Путь маршрута-маркера (цель навигации). */
  path: string;
  /** Текст, по которому тест найдёт приземление (`findByText`). */
  label: string;
};

type RenderRoutesOptions = AuthOptions & {
  /** Компонент-под-тестом и путь, на котором он смонтирован. */
  element: ReactElement;
  path: string;
  /** Стартовый путь (по умолчанию = `path`). */
  initialPath?: string;
  /** Маркеры для целевых путей навигации. */
  landings?: Landing[];
};

/**
 * Рендерит компонент в `<Routes>` вместе с landing-маркерами — для проверки
 * навигации по тому, что видит пользователь (а не слежки за `useNavigate`).
 */
export function renderRoutes(
  options: RenderRoutesOptions,
): RenderResult & { user: UserEvent } {
  const { element, path, initialPath = path, landings = [], ...auth } = options;
  const result = render(
    <Routes>
      <Route path={path} element={element} />
      {landings.map((landing) => (
        <Route key={landing.path} path={landing.path} element={<div>{landing.label}</div>} />
      ))}
    </Routes>,
    {
      wrapper: ({ children }) => (
        <Providers initialPath={initialPath} {...auth}>
          {children}
        </Providers>
      ),
    },
  );

  return { ...result, user: userEvent.setup() };
}

/**
 * Строит полный `AuthContextValue` со спайами-заглушками по умолчанию; тест
 * переопределяет нужные поля (`emailVerified`, `isAuthenticated`, …).
 */
export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    accessToken: null,
    claims: null,
    isAuthenticated: false,
    isBootstrapping: false,
    emailVerified: false,
    setAccessToken: vi.fn(),
    clearSession: vi.fn(),
    openVerifyDialog: vi.fn(),
    ...overrides,
  };
}

/**
 * Возвращает пункт меню Mantine по точному тексту. Снимаем все пункты одним
 * `findAllByRole` и матчим по `textContent` — надёжнее и нагляднее, чем
 * `findByRole("menuitem", { name })` на конкретный пункт. Дропдаун рендерится
 * синхронно благодаря `env="test"` у `MantineProvider` (см. выше).
 */
export async function findMenuItem(text: string): Promise<HTMLElement> {
  const items = await screen.findAllByRole("menuitem");
  const item = items.find((entry) => entry.textContent === text);
  if (item === undefined) {
    const present = items.map((entry) => entry.textContent).join(", ");
    throw new Error(`Пункт меню "${text}" не найден. Доступны: ${present}`);
  }

  return item;
}

export { act, waitFor, within } from "@testing-library/react";
export { screen, userEvent };
