import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { AppHeader } from "../components/AppHeader";
import { ErrorBoundary } from "../components/ErrorBoundary";
import "./home.css";

// Декоративный 3D-глобус — отдельный chunk, грузится лениво после рендера страницы.
const HomeGlobe = lazy(() => import("../components/HomeGlobe").then((m) => ({ default: m.HomeGlobe })));

/*
 * ЗАГЛУШКИ. Дашборд ещё не подключён к бэку: ни статистики, ни рекомендаций, ни списка
 * недавних поездок API пока не отдаёт. Данные оставлены английскими намеренно — переводить
 * вымышленные цифры и описания на два языка значит удваивать работу, которая удалится
 * вместе с моком. Подписи разделов вокруг них — настоящий UI, и они через i18n.
 *
 * Имя в приветствии — тоже заглушка, и её нельзя убрать простой правкой фронта: access-токен
 * несёт только `sub`/`email_verified`/`exp` (см. auth/jwt.ts), эндпоинта профиля в API нет.
 * Нужен либо `/v1/users/me`, либо имя отдельным claim'ом — это бэкенд-задача.
 */
const STAT_KEYS = ["countries", "cities", "streak"] as const;
const STAT_VALUES: Record<(typeof STAT_KEYS)[number], number> = {
  countries: 12,
  cities: 47,
  streak: 7,
};

const RECOMMENDED = {
  countries: [
    { name: "Norway", desc: "Fjords and aurora skies" },
    { name: "Vietnam", desc: "Street food and old temples" },
    { name: "Peru", desc: "Andean trails to Machu Picchu" },
  ],
  cities: [
    { name: "Kyoto", desc: "Zen gardens, quiet shrines" },
    { name: "Porto", desc: "Riverside wine and azulejos" },
    { name: "Reykjavik", desc: "Geothermal lagoons up north" },
  ],
} as const;

const RECENT = [
  { city: "Tokyo", date: "Mar 2026" },
  { city: "Lisbon", date: "Jan 2026" },
  { city: "Berlin", date: "Nov 2025" },
] as const;

const GREETING_NAME = "Dzmitry";
const GREETING_DATE = "Saturday · May 2026";

export function HomePage() {
  const { t } = useTranslation("common");

  return (
    <div className="app-shell home-shell">
      <AppHeader />

      <main className="home-main">
        <div className="home-greeting">
          <span className="home-greeting__hello">{t("greeting", { name: GREETING_NAME })}</span>
          <span className="home-greeting__date">{GREETING_DATE}</span>
        </div>

        <div className="home-stage">
          {/* WebGL-сбой не должен ронять Home — fallback оставит тёмный диск стейджа со свечением. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <HomeGlobe />
            </Suspense>
          </ErrorBoundary>
        </div>

        <p className="home-aura">{t("home.aura")}</p>

        <aside className="home-recommend" aria-label={t("home.recommend.aria")}>
          <div className="home-recommend__head">
            <span className="home-recommend__title">{t("home.recommend.title")}</span>
            <span className="home-recommend__caption">{t("home.recommend.caption")}</span>
          </div>

          <div className="home-recommend__group">
            <span className="home-recommend__group-label">{t("home.recommend.countries")}</span>
            <ul className="home-recommend__list">
              {RECOMMENDED.countries.map((item) => (
                <li key={item.name} className="home-recommend__item">
                  <span className="home-recommend__name">{item.name}</span>
                  <span className="home-recommend__desc">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-recommend__group">
            <span className="home-recommend__group-label">{t("home.recommend.cities")}</span>
            <ul className="home-recommend__list">
              {RECOMMENDED.cities.map((item) => (
                <li key={item.name} className="home-recommend__item">
                  <span className="home-recommend__name">{item.name}</span>
                  <span className="home-recommend__desc">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <aside className="home-right" aria-label={t("home.activity.aria")}>
          <div className="home-stats">
            <span className="home-stats__title">{t("home.stats.title")}</span>
            <ul className="home-stats__list">
              {STAT_KEYS.map((key) => (
                <li key={key} className="home-stat">
                  <span className="home-stat__name">{t(`home.stats.${key}`)}</span>
                  <span className="home-stat__meta">
                    {key === "streak"
                      ? t("home.stats.days", { count: STAT_VALUES[key] })
                      : t("home.stats.visited", { count: STAT_VALUES[key] })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-recent">
            <span className="home-recent__title">{t("home.recent.title")}</span>
            <ul className="home-recent__list">
              {RECENT.map((entry) => (
                <li key={entry.city} className="home-recent__item">
                  <span className="home-recent__city">{entry.city}</span>
                  <span className="home-recent__date">{entry.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
