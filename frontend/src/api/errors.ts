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
 */
export function applyApiError(err: unknown, form: FormLike): string | null {
  if (!(err instanceof ApiError)) {
    return NETWORK_ERROR_MESSAGE;
  }

  const rawField = err.details?.field;
  if (typeof rawField === "string" && rawField.length > 0) {
    form.setFieldError(snakeToCamel(rawField), err.message);
    return null;
  }

  return err.message;
}
