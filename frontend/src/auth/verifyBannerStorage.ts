/**
 * Флаг «плашка о подтверждении email скрыта» живёт в sessionStorage — dismiss
 * действует в пределах вкладки. Чтобы он не утекал между аккаунтами (sessionStorage
 * переживает logout и регистрацию нового пользователя в той же вкладке), вход и
 * регистрация сбрасывают флаг через `resetVerifyBannerDismissed`. Поэтому новый
 * пользователь всегда видит напоминание, даже если в этой вкладке плашку уже
 * скрывали для прежней сессии.
 */

const DISMISS_STORAGE_KEY = "verify-banner-dismissed";

/**
 * Проверяет, скрыта ли плашка в текущей сессии вкладки.

 * Returns:
 *     `True`, если пользователь скрыл плашку и её не нужно показывать.
 */
export function isVerifyBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Помечает плашку как скрытую на текущую сессию вкладки. */
export function dismissVerifyBanner(): void {
  try {
    sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
  } catch {
    // sessionStorage недоступен (приватный режим / отключён) — скрываем только локально.
  }
}

/** Сбрасывает флаг скрытия — вызывается при входе/регистрации (новая сессия). */
export function resetVerifyBannerDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_STORAGE_KEY);
  } catch {
    // sessionStorage недоступен — сбрасывать нечего.
  }
}
