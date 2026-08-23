import { emit } from "../auth/events";
import { getAccessToken, setAccessToken } from "../auth/tokenStore";
import { ApiError, type ApiErrorBody } from "./errors";

const EMAIL_NOT_VERIFIED_CODE = "auth.email_not_verified";
const INVALID_CREDENTIALS_CODE = "auth.invalid_credentials";
const REFRESH_PATH = "/v1/auth/refresh/";

let pendingRefresh: Promise<boolean> | null = null;

function shouldRetryAfterRefresh(status: number, code: string, pathname: string): boolean {
  return (
    status === 401 && code !== INVALID_CREDENTIALS_CODE && code !== EMAIL_NOT_VERIFIED_CODE && pathname !== REFRESH_PATH
  );
}

/**
 * Транспорт сгенерированного SDK — единственный путь всех вызовов нашего API.
 *
 * SDK сам разбирает и валидирует успешный ответ, поэтому здесь остаётся сессия и неуспех:
 * Bearer из `tokenStore`, refresh-cookie, single-flight refresh при 401 с повтором запроса,
 * эмиты `auth-required` / `verify-required`. Не «чистый fetch»: на не-2xx бросает `ApiError`,
 * иначе ветки `instanceof ApiError` на фронте остались бы без своего типа.
 */
export async function appFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);

  // Тело запроса — одноразовый поток, поэтому копию под повтор снимаем до первой отправки.
  const retryable = request.clone();
  const { pathname } = new URL(request.url);

  const response = await sendWithSession(request);
  if (response.ok) {
    return response;
  }

  const errorBody = await parseErrorBody(response);

  if (shouldRetryAfterRefresh(response.status, errorBody.code, pathname)) {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      const retryResponse = await sendWithSession(retryable);
      if (retryResponse.ok) {
        return retryResponse;
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

function sendWithSession(request: Request): Promise<Response> {
  const headers = withAuthorization(new Headers(request.headers));

  return fetch(new Request(request, { credentials: "include", headers }));
}

/**
 * Запрос к `/refresh/` в обход SDK: `sdk.ts` настраивает клиента этим же транспортом,
 * и вызов сгенерированного `refresh()` отсюда замкнул бы импорты в цикл.
 *
 * Путь передаётся строкой, а не `Request`: относительный URL в конструкторе `Request`
 * вне браузера (jsdom + undici) не резолвится — «Failed to parse URL».
 */
function sendRefreshRequest(): Promise<Response> {
  return fetch(REFRESH_PATH, {
    method: "POST",
    credentials: "include",
    headers: withAuthorization(new Headers()),
  });
}

function withAuthorization(headers: Headers): Headers {
  const token = getAccessToken();
  if (token !== null && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body ?? { code: "unknown_error", message: "Unexpected server response" };
}

/**
 * Single-flight refresh: параллельные обращения шерят один pending promise,
 * чтобы не делать N запросов к /v1/auth/refresh/ одновременно. Покрывает оба
 * источника refresh'а — 401-ретраи из `appFetch` и bootstrap из `AuthContext`
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
      const response = await sendRefreshRequest();
      if (!response.ok) {
        return false;
      }

      const body = (await response.json()) as { accessToken: string };
      setAccessToken(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}
