import { createContext, useContext } from "react";

import type { AccessTokenClaims } from "./jwt";

export type AuthContextValue = {
  accessToken: string | null;
  claims: AccessTokenClaims | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  emailVerified: boolean;
  setAccessToken: (token: string) => void;
  clearSession: () => void;
  openVerifyDialog: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }

  return ctx;
}
