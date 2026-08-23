import { createContext, useContext } from "react";

import type { CurrentUser } from "../api/users";

/**
 * Состояние профиля текущего пользователя.
 *
 * `anonymous` — сессии нет (публичные страницы); `loading` — auth-bootstrap или
 * запрос `/me` в полёте; `error` — профиль не загрузился (рендер сам решает,
 * что показывать без него); `ready` — профиль на руках.
 */
export type CurrentUserState =
  | { status: "anonymous" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; user: CurrentUser };

export const CurrentUserContext = createContext<CurrentUserState | null>(null);

export function useCurrentUser(): CurrentUserState {
  const ctx = useContext(CurrentUserContext);
  if (ctx === null) {
    throw new Error("useCurrentUser must be used within a <CurrentUserProvider>");
  }

  return ctx;
}
