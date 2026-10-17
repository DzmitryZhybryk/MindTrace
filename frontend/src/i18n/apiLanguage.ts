import type { Language } from "../api/sdk";

/**
 * Language to request place names in from the backend, given the UI language.
 *
 * i18n may hold a regional variant (`ru-RU`) while the backend knows only `en` and `ru`;
 * anything that is not Russian gets English names.
 */
export function toApiLanguage(language: string): Language {
  return language.startsWith("ru") ? "ru" : "en";
}
