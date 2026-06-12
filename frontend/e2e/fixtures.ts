// Playwright-фикстуры используют колбэк `use(...)` — это API раннера, НЕ React-хук,
// но oxlint матчит имя `use` под rules-of-hooks. Глушим правило для всего файла.
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type Page } from "@playwright/test";

import { loginViaUi, registerUser, type RegisteredUser } from "./helpers/users";

interface Fixtures {
  /** Свежезарегистрированный (через API) пользователь; в UI ещё НЕ залогинен. */
  freshUser: RegisteredUser;
  /** Страница, уже прошедшая UI-логин под `freshUser`. */
  authedPage: Page;
}

/**
 * Базовый `test` с проектными фикстурами.
 *
 * Спеки импортируют `test`/`expect` отсюда, а не из `@playwright/test`, чтобы получить
 * `freshUser` (сид через API) и `authedPage` (уже залогиненная страница) без дублирования
 * preconditions в каждом файле.
 */
export const test = base.extend<Fixtures>({
  freshUser: async ({ request }, use) => {
    await use(await registerUser(request));
  },
  authedPage: async ({ page, freshUser }, use) => {
    await loginViaUi(page, { login: freshUser.username, password: freshUser.password });
    await use(page);
  },
});

export { expect } from "@playwright/test";
