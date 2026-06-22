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
 * Префикс i18n-токена для машинных кодов ошибок бэка (namespace `errors`).
 *
 * Токены ошибок хранятся как строки и резолвятся в текст **во время рендера**
 * (`resolveErrorToken`), а не в момент возникновения ошибки — иначе при смене
 * языка уже показанное сообщение осталось бы на старом языке. Этот префикс
 * отличает код бэка (`errors:auth.invalid_credentials`) от i18n-ключа валидации
 * фронта (`auth:validation.usernameMin`) в едином резолвере.
 */
const ERROR_CODE_PREFIX = "errors:";

/**
 * Оборачивает машинный код ошибки бэка в i18n-токен namespace `errors`.
 *
 * Args:
 *     code: Машинный код из тела ответа бэка (или `"network"` для сетевой ошибки).
 *
 * Returns:
 *     Токен вида `errors:<code>` для отложенного резолва через `resolveErrorToken`.
 */
export function errorCodeToken(code: string): string {
  return `${ERROR_CODE_PREFIX}${code}`;
}

/**
 * Резолвит хранимый токен ошибки в текст на языке активной локали.
 *
 * Токен — это либо код бэка (`errors:<code>`, резолвится через `messageForCode`
 * с fallback'ом на неизвестный код), либо namespace-квалифицированный i18n-ключ
 * валидации фронта (`auth:validation.usernameMin`, `journeys:...`). Вызывается
 * на каждом рендере, поэтому текст всегда соответствует текущему языку.
 *
 * Args:
 *     token: Хранимый токен ошибки (строка) или любое другое значение.
 *
 * Returns:
 *     Локализованный текст или `undefined`, если токена нет (пустое/не-строка).
 */
export function resolveErrorToken(token: unknown): string | undefined {
  if (typeof token !== "string" || token.length === 0) {
    return undefined;
  }

  if (token.startsWith(ERROR_CODE_PREFIX)) {
    return messageForCode(token.slice(ERROR_CODE_PREFIX.length));
  }

  return i18n.t(token);
}

/**
 * Локализует `error` в пропсах инпута, полученных из `form.getInputProps`.
 *
 * Mantine хранит в `form.errors` сырой токен (его кладут валидаторы или
 * `applyApiError`); этот хелпер резолвит токен в текст в момент рендера, чтобы
 * сообщение следовало за сменой языка. Остальные пропсы (`value`, `onChange`, …)
 * проходят насквозь без изменений.
 *
 * Args:
 *     props: Объект пропсов инпута с полем `error` (например, из `getInputProps`).
 *
 * Returns:
 *     Те же пропсы с `error`, резолвленным в локализованный текст.
 */
export function withLocalizedError<T extends { error?: unknown }>(
  props: T,
): Omit<T, "error"> & { error: string | undefined } {
  return { ...props, error: resolveErrorToken(props.error) };
}

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
 * Applies an API error to the given form when possible, returns a top-level
 * error token otherwise.
 *
 * Field-bound errors arrive from the backend with `details.field` (snake_case).
 * They are converted to camelCase to match RHF/Mantine form field names and
 * pushed via `form.setFieldError`. Anything else (no details, non-ApiError,
 * unknown shape) becomes a top-level token.
 *
 * Returns an **error token** (`errors:<code>`), not resolved text: the caller
 * stores it and resolves it at render via `resolveErrorToken`, so the message
 * follows a language switch. The text is always derived from the machine `code`,
 * never from the backend `message` (which is in Russian and may not match the
 * UI language).
 */
export function applyApiError(err: unknown, form: FormLike): string | null {
  if (!(err instanceof ApiError)) {
    return errorCodeToken("network");
  }

  const rawField = err.details?.field;
  if (typeof rawField === "string" && rawField.length > 0) {
    form.setFieldError(snakeToCamel(rawField), errorCodeToken(err.code));
    return null;
  }

  return errorCodeToken(err.code);
}
