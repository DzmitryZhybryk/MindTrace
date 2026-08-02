import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

const BRAND = "MyJourney";

/**
 * Заголовок вкладки по текущему маршруту.
 *
 * До него `<title>` из `index.html` стоял неизменным на всех девяти маршрутах: вкладки
 * не различались, история браузера состояла из одинаковых записей, а скринридер после
 * SPA-перехода не сообщал, куда пользователь попал (смена маршрута — не перезагрузка,
 * поэтому единственный сигнал «страница другая» — как раз заголовок).
 *
 * Ключи берутся из уже существующего копирайта разделов, чтобы заголовок вкладки и
 * заголовок на экране не разъезжались. Возвращает `null` — это эффект, а не разметка.
 */
export function DocumentTitle() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation(["common", "auth", "journeys"]);

  useEffect(() => {
    const title = resolveTitle(pathname, t);
    // Лендинг несёт полный заголовок с оффером, внутренние экраны — «Раздел · Бренд».
    document.title = title === null ? `${BRAND} — ${t("pageTitle.landing")}` : `${title} · ${BRAND}`;
    // i18n.language в зависимостях: при смене языка `t` тот же самый, а заголовок должен
    // перевестись — без этого во вкладке остаётся прежний язык до следующей навигации.
  }, [pathname, t, i18n.language]);

  return null;
}

/** Заголовок раздела или `null` для лендинга (у него свой полный заголовок). */
function resolveTitle(pathname: string, t: (key: string) => string): string | null {
  if (pathname.startsWith("/login")) return t("auth:login.title");
  if (pathname.startsWith("/signup")) return t("auth:signup.title");
  if (pathname.startsWith("/home")) return t("pageTitle.home");
  if (pathname.startsWith("/journeys/add")) return t("journeys:addJourney.title");
  if (pathname.startsWith("/journeys")) return t("journeys:title");

  return null;
}
