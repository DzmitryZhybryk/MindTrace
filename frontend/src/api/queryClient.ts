import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./errors";

// Три повтора поверх исходной попытки: backoff у Query экспоненциальный, и к четвёртой
// пауза уже длиннее, чем пользователь готов смотреть на спиннер.
const MAX_RETRIES = 3;

/**
 * Решает, повторять ли упавший запрос.
 *
 * Повторяем только транзиентное — сеть, 5xx, битый ответ. `ApiError` с 4xx это ответ
 * сервера по существу (не найдено, нет прав, не прошло валидацию), и повтор вернёт
 * ровно то же самое; 401 к этому моменту уже пережил refresh-ретрай в транспорте.
 *
 * Args:
 *     failureCount: Сколько попыток уже провалилось.
 *     error: Ошибка последней попытки.
 *
 * Returns:
 *     `true`, если имеет смысл повторить запрос.
 */
export function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }

  return failureCount < MAX_RETRIES;
}

/**
 * Собирает Query-клиент приложения.
 *
 * Фабрика, а не модульный синглтон: кэш живёт столько же, сколько процесс, поэтому
 * владеет им composition root (`main.tsx`), а тестам достаётся свой изолированный
 * экземпляр без общего состояния между кейсами.
 *
 * Returns:
 *     Новый `QueryClient` с политикой повторов приложения.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
    },
  });
}
