import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ensureRefreshed } from "../api/client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { on as onAuthEvent } from "./events";
import { decodeAccessTokenClaims, type AccessTokenClaims } from "./jwt";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken as writeAccessToken,
  subscribeAccessToken,
} from "./tokenStore";
import { AuthContext, type AuthContextValue } from "./useAuth";
import { resetVerifyBannerDismissed } from "./verifyBannerStorage";

// Провайдер стоит на корне, а диалог открывают редко и только залогиненные. Статический импорт
// тянул бы Modal, PinInput и блокировку прокрутки в загрузку каждой страницы, включая лендинг.
const VerifyEmailDialog = lazy(() =>
  import("./VerifyEmailDialog").then((m) => ({ default: m.VerifyEmailDialog })),
);

// До первого открытия диалога нет вовсе; после — он остаётся смонтированным, чтобы
// закрытие доигрывало анимацию, а повторное открытие не ждало загрузки.
type VerifyDialogState = "never-opened" | "open" | "closed";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => getAccessToken() === null);
  const [verifyDialog, setVerifyDialog] = useState<VerifyDialogState>("never-opened");
  const isAuthenticated = accessToken !== null;

  useEffect(() => {
    return subscribeAccessToken((token) => setAccessTokenState(token));
  }, []);

  // Кэш Query держит данные ушедшей сессии (профиль, карта поездок) — без сброса их
  // увидел бы следующий вошедший в этой вкладке, причём глобус-фон со `staleTime: Infinity`
  // не перезапросил бы их никогда. Чистим на СМЕНЕ auth-состояния, а не в обработчике
  // кнопки: разлогин приходит тремя путями (кнопка, событие `auth-required` из транспорта,
  // код `users.user_deleted` на /me), и общее у них ровно одно — пропавший токен.
  useEffect(() => {
    if (!isAuthenticated) {
      queryClient.clear();
    }
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isBootstrapping) {
      return;
    }

    let cancelled = false;
    (async () => {
      // Через single-flight `ensureRefreshed`, а не прямой refresh(): иначе
      // двойной запуск эффекта под StrictMode дал бы два параллельных /refresh/
      // и reuse-detection на бэке оборвал бы сессию. Токен пишет сам
      // ensureRefreshed (на успехе) — подписка обновит state.
      const refreshed = await ensureRefreshed();
      if (cancelled) {
        return;
      }

      if (!refreshed) {
        clearAccessToken();
      }

      setIsBootstrapping(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isBootstrapping]);

  useEffect(() => {
    const offVerify = onAuthEvent("verify-required", () => setVerifyDialog("open"));
    const offAuth = onAuthEvent("auth-required", () => clearAccessToken());
    return () => {
      offVerify();
      offAuth();
    };
  }, []);

  const claims = useMemo<AccessTokenClaims | null>(
    () => (accessToken !== null ? decodeAccessTokenClaims(accessToken) : null),
    [accessToken],
  );

  const setAccessToken = useCallback((token: string) => {
    // Вход/регистрация — новая сессия: сбрасываем «скрытие» плашки о подтверждении
    // email, чтобы dismiss прежнего аккаунта не утёк в эту вкладку (см. verifyBannerStorage).
    resetVerifyBannerDismissed();
    writeAccessToken(token);
  }, []);
  const clearSession = useCallback(() => clearAccessToken(), []);
  const openVerifyDialog = useCallback(() => setVerifyDialog("open"), []);
  const closeVerifyDialog = useCallback(() => setVerifyDialog("closed"), []);

  const value: AuthContextValue = {
    accessToken,
    claims,
    isAuthenticated,
    isBootstrapping,
    emailVerified: claims?.email_verified ?? false,
    setAccessToken,
    clearSession,
    openVerifyDialog,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Не загрузился chunk диалога — гасим только диалог, а не всё приложение. */}
      {verifyDialog !== "never-opened" && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <VerifyEmailDialog opened={verifyDialog === "open"} onClose={closeVerifyDialog} />
          </Suspense>
        </ErrorBoundary>
      )}
    </AuthContext.Provider>
  );
}
