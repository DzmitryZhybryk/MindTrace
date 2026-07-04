import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { SoonBadge } from "../../components/SoonBadge";

// Под-навигация раздела (карты → списки). У «Карты путешествий» end=true, чтобы
// /journeys не подсвечивался на дочерних маршрутах. «Добавить» — отдельно ниже.
// `soon: true` — раздел ещё не реализован: пункт рендерится неактивным (не ссылка)
// с бейджем «Soon» вместо перехода в пустой маршрут.
const NAV_ITEMS = [
  { key: "map", to: "/journeys", end: true, soon: false },
  { key: "movements", to: "/journeys/movements", end: false, soon: true },
  { key: "all", to: "/journeys/all", end: false, soon: true },
  { key: "wishlist", to: "/journeys/wishlist", end: false, soon: true },
] as const;

/**
 * Левое боковое меню раздела Journeys: заголовок и под-навигация. Легенда карты
 * вынесена из меню в отдельный угловой блок (см. JourneysMapView).
 */
export function JourneysPanel() {
  const { t } = useTranslation("journeys");

  return (
    <section className="journeys-panel journeys-card" aria-label={t("controls")}>
      <span className="journeys-panel__label">{t("title")}</span>

      <nav className="journeys-nav">
        {NAV_ITEMS.map((item) =>
          item.soon ? (
            <span
              key={item.key}
              className="journeys-nav__item journeys-nav__item--soon"
              aria-disabled="true"
              title={t("common:badge.comingSoon")}
            >
              {t(`nav.${item.key}`)}
              <SoonBadge />
            </span>
          ) : (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "journeys-nav__item journeys-nav__item--active" : "journeys-nav__item"
              }
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ),
        )}
        <NavLink
          to="/journeys/add"
          className={({ isActive }) =>
            isActive ? "journeys-nav__add journeys-nav__add--active" : "journeys-nav__add"
          }
        >
          {t("nav.add")}
        </NavLink>
        {/*
         * «Добавить место» (моря, горы, …) — вторичное действие рядом с «Добавить
         * путешествие» (города). Пока не реализовано: disabled-кнопка с бейджем «Soon».
         */}
        <button
          type="button"
          className="journeys-nav__add-place"
          disabled
          title={t("common:badge.comingSoon")}
        >
          {t("nav.addPlace")}
          <SoonBadge />
        </button>
      </nav>
    </section>
  );
}
