/**
 * Инициализация i18next для приложения.
 *
 * Локали грузятся лениво (dynamic `import()`), поэтому в бандл попадает только
 * активный язык — число языков не раздувает основной чанк. `LanguageDetector`
 * выбирает язык: localStorage → язык браузера → `DEFAULT_LANGUAGE`.
 */

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGE_CODES } from "./languages";

/** Namespace'ы переводов. Имя файла локали = namespace (`<code>/<ns>.json`). */
export const I18N_NAMESPACES = ["common", "auth", "errors"] as const;

/** Ключ в localStorage, под которым хранится выбор языка. */
export const LANGUAGE_STORAGE_KEY = "mindtrace.language";

void i18n
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      (language: string, namespace: string) => import(`../locales/${language}/${namespace}.json`),
    ),
  )
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
    // ru-RU / en-US нормализуются до базового языка (ru / en)
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    ns: [...I18N_NAMESPACES],
    defaultNS: "common",
    // React сам экранирует значения — двойное экранирование не нужно
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

// Держим атрибут <html lang> в синхроне с активным языком (a11y / SEO)
i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

export { i18n };
