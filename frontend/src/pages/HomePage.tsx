import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { AppHeader } from "../components/AppHeader";
import { ErrorBoundary } from "../components/ErrorBoundary";
import "./home.css";

// Декоративный 3D-глобус — отдельный chunk, грузится лениво после рендера страницы.
const HomeGlobe = lazy(() => import("../components/HomeGlobe").then((m) => ({ default: m.HomeGlobe })));

const STATS = [
  { name: "Countries", meta: "12 visited" },
  { name: "Cities", meta: "47 visited" },
  { name: "Streak", meta: "7 days" },
] as const;

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
const AURA_WORD = "atmosphere · still";

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

        <p className="home-aura">{AURA_WORD}</p>

        <aside className="home-recommend" aria-label="Recommended for you">
          <div className="home-recommend__head">
            <span className="home-recommend__title">you might like</span>
            <span className="home-recommend__caption">
              Based on places you&apos;ve rated — or travelers like you, until we know your taste
            </span>
          </div>

          <div className="home-recommend__group">
            <span className="home-recommend__group-label">countries</span>
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
            <span className="home-recommend__group-label">cities</span>
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

        <aside className="home-right" aria-label="Activity">
          <div className="home-stats">
            <span className="home-stats__title">achievements</span>
            <ul className="home-stats__list">
              {STATS.map((stat) => (
                <li key={stat.name} className="home-stat">
                  <span className="home-stat__name">{stat.name}</span>
                  <span className="home-stat__meta">{stat.meta}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-recent">
            <span className="home-recent__title">recent</span>
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
