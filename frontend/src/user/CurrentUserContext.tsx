import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../api/errors";
import { getCurrentUser } from "../api/users";
import { useAuth } from "../auth/useAuth";
import { CurrentUserContext, type CurrentUserState } from "./useCurrentUser";

// Коды, за которыми не стоит живого пользователя: повторять запрос бессмысленно,
// сессия подлежит разлогину. Ветвимся по `code` (стабильный контракт API), не по
// HTTP-статусу — статус здесь деталь транспорта.
const SESSION_INVALID_CODES: ReadonlySet<string> = new Set(["users.user_deleted", "users.user_not_found"]);

interface CurrentUserProviderProps {
  children: ReactNode;
}

/**
 * Грузит профиль (`/v1/users/me`) один раз на сессию и раздаёт его через контекст.
 *
 * Живёт ПОВЕРХ `AuthProvider` и реагирует на его состояние: пока auth-bootstrap не
 * завершён — `loading` (запрос не шлём, токена может ещё не быть); без сессии —
 * `anonymous`; логин/логаут переключают `isAuthenticated` и эффект сам загружает
 * или сбрасывает профиль.
 */
export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const { isAuthenticated, isBootstrapping, clearSession } = useAuth();
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });

  useEffect(() => {
    if (isBootstrapping) {
      setState({ status: "loading" });
      return;
    }

    if (!isAuthenticated) {
      setState({ status: "anonymous" });
      return;
    }

    // `cancelled`-флаг (образец — bootstrap в AuthContext): abort не гарантирует
    // AbortError-rejection (client.ts может превратить его в ApiError или поздний
    // успех), поэтому устаревший запрос отсекается флагом на обоих путях, а
    // AbortController лишь обрывает сам сетевой вызов.
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });
    getCurrentUser(controller.signal)
      .then((user) => {
        if (cancelled) {
          return;
        }

        setState({ status: "ready", user });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        // Семантика «пользователя больше нет» — разлогин; провайдер перейдёт в
        // anonymous сам, когда isAuthenticated погаснет. Транзиентные сбои (сеть,
        // 5xx) остаются терминальным error до внедрения server-state библиотеки
        // (см. .claude/feature_plan.md, п. 1).
        if (error instanceof ApiError && SESSION_INVALID_CODES.has(error.code)) {
          clearSession();
          return;
        }

        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated, isBootstrapping, clearSession]);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}
