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

import { type ReactElement, type ReactNode } from "react";

import { MantineProvider } from "@mantine/core";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { AuthContext, type AuthContextValue } from "../auth/useAuth";
import { theme } from "../theme";

type AuthOptions = {
  /** Stub-значение контекста; имеет приоритет над `withAuthProvider`. */
  authValue?: AuthContextValue;
  /** Обернуть в реальный `<AuthProvider>` (если `authValue` не задан). */
  withAuthProvider?: boolean;
};

type ProvidersProps = AuthOptions & {
  children: ReactNode;
  initialPath: string;
};

function Providers({ children, initialPath, authValue, withAuthProvider }: ProvidersProps) {
  let withAuth: ReactNode = children;
  if (authValue !== undefined) {
    withAuth = <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
  } else if (withAuthProvider) {
    withAuth = <AuthProvider>{children}</AuthProvider>;
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
      <MemoryRouter initialEntries={[initialPath]}>{withAuth}</MemoryRouter>
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
