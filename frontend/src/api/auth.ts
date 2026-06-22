import { apiFetch } from "./client";

export type TokenResponse = {
  accessToken: string;
  tokenType: string;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  termsAccepted: boolean;
  marketingEmailsConsent: boolean;
};

export type LoginPayload = {
  login: string;
  password: string;
};

export type VerifyEmailPayload = {
  code: string;
};

export function register(payload: RegisterPayload): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/v1/auth/register/", {
    method: "POST",
    json: {
      username: payload.username,
      email: payload.email,
      password: payload.password,
      termsAccepted: payload.termsAccepted,
      marketingEmailsConsent: payload.marketingEmailsConsent,
    },
  });
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/v1/auth/login/", {
    method: "POST",
    json: {
      login: payload.login,
      password: payload.password,
    },
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/v1/auth/logout/", { method: "POST" });
}

export function refresh(): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/v1/auth/refresh/", { method: "POST" });
}

export function sendEmailVerification(): Promise<void> {
  return apiFetch<void>("/v1/auth/email/send-verification/", { method: "POST" });
}

export function verifyEmail(payload: VerifyEmailPayload): Promise<void> {
  return apiFetch<void>("/v1/auth/email/verify/", {
    method: "POST",
    json: { code: payload.code },
  });
}
