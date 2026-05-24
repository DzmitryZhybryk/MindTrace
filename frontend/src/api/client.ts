import { emit } from "../auth/events";
import { getAccessToken, setAccessToken } from "../auth/tokenStore";
import { ApiError, type ApiErrorBody } from "./errors";

const EMAIL_NOT_VERIFIED_CODE = "auth.email_not_verified";
const INVALID_CREDENTIALS_CODE = "auth.invalid_credentials";
const REFRESH_PATH = "/v1/auth/refresh/";

export type ApiFetchInit = Omit<RequestInit, "body"> & {
  json?: unknown;
};

let pendingRefresh: Promise<boolean> | null = null;

/**
 * Тонкая обёртка над `fetch` для всех вызовов нашего API:
 * - `credentials: "include"` для refresh-cookie;
 * - авто-вставка `Authorization: Bearer <access_token>` из `tokenStore`;
 * - JSON-сериализация тела через `json`;
 * - маппинг неуспеха в `ApiError`;
 * - single-flight refresh при 401 (кроме invalid_credentials / email_not_verified / самого /refresh/);
 * - перехват 401 `auth.email_not_verified` для JIT-гейта (эмит `verify-required`).
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const response = await sendRequest(path, init);

  if (response.ok) {
    return parseSuccess<T>(response);
  }

  const errorBody = await parseErrorBody(response);

  const canRetryAfterRefresh =
    response.status === 401 &&
    errorBody.code !== INVALID_CREDENTIALS_CODE &&
    errorBody.code !== EMAIL_NOT_VERIFIED_CODE &&
    path !== REFRESH_PATH;

  if (canRetryAfterRefresh) {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      const retryResponse = await sendRequest(path, init);
      if (retryResponse.ok) {
        return parseSuccess<T>(retryResponse);
      }

      throw new ApiError(retryResponse.status, await parseErrorBody(retryResponse));
    }

    emit("auth-required", undefined);
  }

  if (response.status === 401 && errorBody.code === EMAIL_NOT_VERIFIED_CODE) {
    emit("verify-required", undefined);
  }

  throw new ApiError(response.status, errorBody);
}

async function sendRequest(path: string, init: ApiFetchInit): Promise<Response> {
  const { json, headers, ...rest } = init;

  const finalHeaders = new Headers(headers);
  if (json !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token !== null && !finalHeaders.has("Authorization")) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  return fetch(path, {
    ...rest,
    credentials: "include",
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body ?? { code: "unknown_error", message: "Unexpected server response" };
}

/**
 * Single-flight refresh: параллельные обращения шерят один pending promise,
 * чтобы не делать N запросов к /v1/auth/refresh/ одновременно. Покрывает оба
 * источника refresh'а — 401-ретраи из `apiFetch` и bootstrap из `AuthContext`
 * (включая двойной запуск эффекта под React StrictMode в dev). Это критично
 * из-за ротации refresh-токена с reuse-detection на бэке: два параллельных
 * /refresh/ с одной cookie привели бы к revoke-all и обрыву сессии. После
 * завершения promise сбрасывается; следующий вызов запустит новый refresh.
 *
 * Returns:
 *     `true`, если есть валидная сессия (access-token записан в tokenStore),
 *     иначе `false`.
 */
export function ensureRefreshed(): Promise<boolean> {
  if (pendingRefresh !== null) {
    return pendingRefresh;
  }

  pendingRefresh = (async () => {
    try {
      const response = await sendRequest(REFRESH_PATH, { method: "POST" });
      if (!response.ok) {
        return false;
      }

      const body = (await response.json()) as { access_token: string };
      setAccessToken(body.access_token);
      return true;
    } catch {
      return false;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}
