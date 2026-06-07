/**
 * Глобальный setup для Vitest (подключён через `test.setupFiles` в `vite.config.ts`).
 *
 * i18next в приложении грузит локали лениво (dynamic `import()` через
 * `resourcesToBackend`), поэтому в тестах `i18n.t(...)` без подготовки вернул бы
 * сам ключ. Подгружаем `en`-бандлы синхронно на тот же singleton-инстанс, что
 * использует код, — так `messageForCode` / `applyApiError` резолвят реальные
 * тексты, а не моки (тестируем настоящий маппинг кодов ошибок).
 */

import enAuth from "../locales/en/auth.json";
import enCommon from "../locales/en/common.json";
import enErrors from "../locales/en/errors.json";
import { i18n } from "../i18n";

i18n.addResourceBundle("en", "common", enCommon, true, true);
i18n.addResourceBundle("en", "auth", enAuth, true, true);
i18n.addResourceBundle("en", "errors", enErrors, true, true);

void i18n.changeLanguage("en");
