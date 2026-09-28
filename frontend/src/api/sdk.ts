/**
 * Единственный вход к сгенерированному SDK.
 *
 * Импортировать из `./generated` напрямую нельзя: конфигурация клиента живёт здесь, и в обход
 * этого модуля SDK ушёл бы в сеть голым `fetch` — без Bearer, refresh-cookie и single-flight
 * refresh.
 */
import { appFetch } from "./client";
import { ApiError } from "./errors";
import { client } from "./generated/client.gen";

// baseUrl обязателен: клиент конструирует Request сам, а вне браузера (jsdom + undici в тестах)
// относительный URL не с чем резолвить — «Failed to parse URL». API живёт на том же origin.
// throwOnError тоже обязателен: клиент ловит любой бросок транспорта в свой try/catch и без этого
// флага вернёт ApiError результатом вместо исключения. На вызовах его дублируют ради сужения типа.
client.setConfig({ baseUrl: window.location.origin, fetch: appFetch, throwOnError: true });

// Ошибки ответа транспорт уже отдал как ApiError. Всё остальное, что бросает клиент, — провал
// разбора успешного ответа (битый JSON, непрошедшая zod-валидация): без этого шва SyntaxError и
// ZodError прошли бы мимо applyApiError и всей i18n ошибок.
client.interceptors.error.use((error, response) => {
  // Ответа нет — это сетевой сбой или отмена; applyApiError покажет его как network, не трогаем.
  if (error instanceof ApiError || !response) {
    return error;
  }

  return new ApiError(response.status, { code: "invalid_response", message: "Malformed response body" });
});

export * from "./generated";
export * from "./generated/@tanstack/react-query.gen";
export * from "./generated/zod.gen";
