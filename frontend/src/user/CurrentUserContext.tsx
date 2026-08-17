import { useEffect, useState, type ReactNode } from "react";

import { getCurrentUser } from "../api/users";
import { useAuth } from "../auth/useAuth";
import { CurrentUserContext, type CurrentUserState } from "./useCurrentUser";

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
  const { isAuthenticated, isBootstrapping } = useAuth();
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

    const controller = new AbortController();
    setState({ status: "loading" });
    getCurrentUser(controller.signal)
      .then((user) => {
        setState({ status: "ready", user });
      })
      .catch((error: unknown) => {
        /* v8 ignore next 3 */
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({ status: "error" });
      });

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, isBootstrapping]);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}
