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

const NETWORK_ERROR_MESSAGE = "Network error. Please try again.";
const FALLBACK_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Сообщения для пользователя по коду ошибки бэка. Фронт владеет английским
 * текстом сам — бэк отдаёт сообщения на русском, и доверять его формулировке
 * для UI нельзя (язык не совпадает с интерфейсом).
 */
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Please check the entered data and try again",
  "auth.invalid_credentials": "Incorrect username/email or password",
  "auth.user_credentials_not_found": "Incorrect username/email or password",
  "auth.email_already_registered": "This email is already registered",
  "auth.username_already_taken": "This username is already taken",
  "auth.terms_not_accepted": "You must accept the terms to continue",
  "auth.email_already_verified": "Your email is already verified",
  "auth.verification_code_invalid": "Invalid verification code",
  "auth.challenge_not_found": "No active code. Request a new one",
  "auth.challenge_expired": "The code has expired. Request a new one",
  "auth.challenge_attempts_exceeded": "Too many attempts. Request a new code",
  "auth.challenge_resend_cooldown": "Please wait before requesting a new code",
  "auth.invalid_access_token": "Your session has expired. Please sign in again",
  "auth.invalid_refresh_token": "Your session has expired. Please sign in again",
};

/**
 * Возвращает английское сообщение для пользователя по коду ошибки.
 *
 * Args:
 *     code: Машинный код ошибки из тела ответа бэка.
 *     fallback: Текст на случай неизвестного кода.
 *
 * Returns:
 *     Готовое к показу сообщение на английском.
 */
export function messageForCode(code: string, fallback: string = FALLBACK_ERROR_MESSAGE): string {
  return ERROR_MESSAGES[code] ?? fallback;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
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
 * (English), never from the backend `message` (which is in Russian).
 */
export function applyApiError(err: unknown, form: FormLike): string | null {
  if (!(err instanceof ApiError)) {
    return NETWORK_ERROR_MESSAGE;
  }

  const rawField = err.details?.field;
  if (typeof rawField === "string" && rawField.length > 0) {
    form.setFieldError(snakeToCamel(rawField), messageForCode(err.code));
    return null;
  }

  return messageForCode(err.code);
}
