import { i18n } from "../i18n";

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  timestamp?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? null;
  }
}

type FormLike = {
  setFieldError: (path: string, error: string) => void;
};

/**
 * Возвращает локализованное сообщение для пользователя по коду ошибки бэка.
 *
 * Текст берётся из namespace `errors` активного языка (фронт владеет
 * формулировками сам); бэковый `message` для UI не используется. Неизвестный
 * код резолвится в `fallback`.
 *
 * Args:
 *     code: Машинный код ошибки из тела ответа бэка.
 *     fallback: Текст на случай неизвестного кода (по умолчанию — `errors:fallback`).
 *
 * Returns:
 *     Готовое к показу сообщение на языке активной локали.
 */
export function messageForCode(code: string, fallback?: string): string {
  const resolvedFallback = fallback ?? i18n.t("fallback", { ns: "errors" });
  return i18n.t(code, { ns: "errors", defaultValue: resolvedFallback });
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/gu, (_, ch: string) => ch.toUpperCase());
}

/**
 * Applies an API error to the given form when possible, returns a fallback
 * message for a top-level alert otherwise.
 *
 * Field-bound errors arrive from the backend with `details.field` (snake_case).
 * They are converted to camelCase to match RHF/Mantine form field names and
 * pushed via `form.setFieldError`. Anything else (no details, non-ApiError,
 * unknown shape) becomes a top-level message.
 *
 * The user-facing text is resolved from the error `code` via `messageForCode`
 * (localized), never from the backend `message` (which is in Russian and may
 * not match the UI language).
 */
export function applyApiError(err: unknown, form: FormLike): string | null {
  if (!(err instanceof ApiError)) {
    return i18n.t("network", { ns: "errors" });
  }

  const rawField = err.details?.field;
  if (typeof rawField === "string" && rawField.length > 0) {
    form.setFieldError(snakeToCamel(rawField), messageForCode(err.code));
    return null;
  }

  return messageForCode(err.code);
}
