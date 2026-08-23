import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { ApiError } from "../api/errors";
import { getCurrentUserOptions, type CurrentUserResponse } from "../api/sdk";
import { useAuth } from "../auth/useAuth";
import { CurrentUserContext, type CurrentUserState } from "./useCurrentUser";

// Коды, за которыми не стоит живого пользователя: повторять запрос бессмысленно,
// сессия подлежит разлогину. Ветвимся по `code` (стабильный контракт API), не по
// HTTP-статусу — статус здесь деталь транспорта.
const SESSION_INVALID_CODES: ReadonlySet<string> = new Set(["users.user_deleted", "users.user_not_found"]);

function isSessionInvalid(error: unknown): boolean {
  return error instanceof ApiError && SESSION_INVALID_CODES.has(error.code);
}

interface CurrentUserProviderProps {
  children: ReactNode;
}

/**
 * Грузит профиль (`/v1/users/me`) и раздаёт его через контекст.
 *
 * Живёт ПОВЕРХ `AuthProvider` и реагирует на его состояние: пока auth-bootstrap не
 * завершён — `loading` (запрос не шлём, токена может ещё не быть); без сессии —
 * `anonymous`; логин/логаут переключают `isAuthenticated`, а с ним и `enabled` запроса.
 * Транзиентные сбои (сеть, 5xx) Query повторяет сам, поэтому `error` здесь — уже
 * терминальный исход, а не первая неудача.
 */
export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const { isAuthenticated, isBootstrapping, clearSession } = useAuth();
  const { data, error } = useQuery({
    ...getCurrentUserOptions(),
    enabled: !isBootstrapping && isAuthenticated,
  });

  // Семантика «пользователя больше нет» — разлогин; провайдер уйдёт в anonymous сам,
  // когда погаснет isAuthenticated.
  useEffect(() => {
    if (isSessionInvalid(error)) {
      clearSession();
    }
  }, [error, clearSession]);

  return (
    <CurrentUserContext.Provider value={toState({ isAuthenticated, isBootstrapping, data, error })}>
      {children}
    </CurrentUserContext.Provider>
  );
}

interface StateInput {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  data: CurrentUserResponse | undefined;
  error: unknown;
}

/**
 * Сводит auth-состояние и исход запроса в машину состояний контекста.
 *
 * Auth важнее данных: поздний ответ на запрос, отправленный до логаута, не должен
 * поднять профиль поверх `anonymous`. Разлогинивающий код держит `loading` — состояние
 * временное, `clearSession` уже в пути и переведёт провайдер в `anonymous`.
 *
 * Args:
 *     input: Флаги auth-провайдера и результат запроса `/me`.
 *
 * Returns:
 *     Состояние для потребителей `useCurrentUser`.
 */
function toState({ isAuthenticated, isBootstrapping, data, error }: StateInput): CurrentUserState {
  if (isBootstrapping) {
    return { status: "loading" };
  }

  if (!isAuthenticated) {
    return { status: "anonymous" };
  }

  if (data !== undefined) {
    return { status: "ready", user: data };
  }

  if (error !== null && error !== undefined) {
    return isSessionInvalid(error) ? { status: "loading" } : { status: "error" };
  }

  return { status: "loading" };
}
