import { ApiError, type ApiErrorBody } from "./errors";

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  termsAccepted: boolean;
  marketingEmailsConsent: boolean;
};

export type RegisterResponse = {
  access_token: string;
  token_type: string;
};

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const response = await fetch("/v1/auth/register/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: payload.username,
      email: payload.email,
      password: payload.password,
      terms_accepted: payload.termsAccepted,
      marketing_emails_consent: payload.marketingEmailsConsent,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body ?? { code: "unknown_error", message: "Unexpected server response" },
    );
  }

  return (await response.json()) as RegisterResponse;
}
