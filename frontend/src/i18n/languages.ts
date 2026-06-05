/**
 * Реестр поддерживаемых языков — ЕДИНСТВЕННОЕ место, которое нужно тронуть
 * при добавлении нового языка.
 *
 * Чтобы добавить язык:
 *   1. добавить объект `{ code, nativeName }` в `SUPPORTED_LANGUAGES`;
 *   2. создать папку `src/locales/<code>/` с теми же namespace-файлами,
 *      что и у остальных языков (`common.json`, `auth.json`, `errors.json`).
 *
 * Тип `LanguageCode` выводится из массива автоматически (`as const`),
 * поэтому отдельно его править не нужно — он расширится сам.
 */

export interface LanguageMeta {
  readonly code: string;
  readonly nativeName: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", nativeName: "English" },
  { code: "ru", nativeName: "Русский" },
] as const satisfies readonly LanguageMeta[];

/** Union кодов поддерживаемых языков, выведенный из реестра. */
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** Язык-фоллбэк, если детект не дал поддерживаемого значения. */
export const DEFAULT_LANGUAGE: LanguageCode = "en";

/** Плоский список кодов — для `supportedLngs` и переключателя. */
export const SUPPORTED_LANGUAGE_CODES: readonly LanguageCode[] = SUPPORTED_LANGUAGES.map(
  (language) => language.code,
);
