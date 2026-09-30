import type { Language } from "../api/sdk";

/**
 * Язык, на котором просить у бэка названия мест, по языку интерфейса.
 *
 * i18n может держать региональный вариант (`ru-RU`), а бэк знает только `en` и `ru`;
 * всё, что не русский, получает английские названия.
 */
export function toApiLanguage(language: string): Language {
  return language.startsWith("ru") ? "ru" : "en";
}
