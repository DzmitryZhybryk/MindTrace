import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ensureRefreshed } from "../api/client";
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
import { VerifyEmailDialog } from "./VerifyEmailDialog";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => getAccessToken() === null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  useEffect(() => {
    return subscribeAccessToken((token) => setAccessTokenState(token));
  }, []);

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
    const offVerify = onAuthEvent("verify-required", () => setVerifyDialogOpen(true));
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
  const openVerifyDialog = useCallback(() => setVerifyDialogOpen(true), []);
  const closeVerifyDialog = useCallback(() => setVerifyDialogOpen(false), []);

  const value: AuthContextValue = {
    accessToken,
    claims,
    isAuthenticated: accessToken !== null,
    isBootstrapping,
    emailVerified: claims?.email_verified ?? false,
    setAccessToken,
    clearSession,
    openVerifyDialog,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <VerifyEmailDialog opened={verifyDialogOpen} onClose={closeVerifyDialog} />
    </AuthContext.Provider>
  );
}
