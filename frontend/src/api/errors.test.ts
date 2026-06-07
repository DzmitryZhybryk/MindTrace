import { describe, expect, it, vi } from "vitest";

import { ApiError, applyApiError, messageForCode } from "./errors";

describe("messageForCode", () => {
  it("возвращает локализованный текст для известного кода", () => {
    expect(messageForCode("auth.invalid_credentials")).toBe("Incorrect username/email or password");
  });

  it("возвращает дефолтный fallback для неизвестного кода", () => {
    expect(messageForCode("totally.unknown")).toBe("Something went wrong. Please try again.");
  });

  it("использует переданный fallback для неизвестного кода", () => {
    expect(messageForCode("totally.unknown", "Custom fallback")).toBe("Custom fallback");
  });
});

describe("applyApiError", () => {
  it("для не-ApiError возвращает network-сообщение и не трогает форму", () => {
    const form = { setFieldError: vi.fn() };

    const message = applyApiError(new Error("boom"), form);

    expect(message).toBe("Network error. Please try again.");
    expect(form.setFieldError).not.toHaveBeenCalled();
  });

  it("привязывает ошибку к полю с конверсией snake_case → camelCase", () => {
    const form = { setFieldError: vi.fn() };
    const err = new ApiError(409, {
      code: "auth.username_already_taken",
      message: "русский текст бэка",
      details: { field: "user_name" },
    });

    const message = applyApiError(err, form);

    expect(message).toBeNull();
    expect(form.setFieldError).toHaveBeenCalledWith("userName", "This username is already taken");
  });

  it("без поля в details возвращает локализованное сообщение верхнего уровня", () => {
    const form = { setFieldError: vi.fn() };
    const err = new ApiError(401, { code: "auth.invalid_credentials", message: "русский текст бэка" });

    const message = applyApiError(err, form);

    expect(message).toBe("Incorrect username/email or password");
    expect(form.setFieldError).not.toHaveBeenCalled();
  });
});
