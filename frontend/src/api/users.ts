import { z } from "zod";

import { apiFetch } from "./client";

/**
 * Zod-схема ответа `/v1/users/me` — валидация на HTTP-границе (untrusted input).
 * Контракт зеркалит backend `CurrentUserResponse` (camelCase на проводе);
 * `displayName` опционален по контракту — фоллбэк на `username` делает рендер.
 */
const currentUserResponseSchema = z.object({
  username: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
});

export type CurrentUser = z.infer<typeof currentUserResponseSchema>;

/** Загружает профиль текущего пользователя. Невалидный ответ → исключение (fail fast). */
export async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  const response = await apiFetch<unknown>("/v1/users/me", { signal });
  return currentUserResponseSchema.parse(response);
}
