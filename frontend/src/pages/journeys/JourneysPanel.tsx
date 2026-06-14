import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

// Под-навигация раздела (карты → списки). У «Карты путешествий» end=true, чтобы
// /journeys не подсвечивался на дочерних маршрутах. «Добавить» — отдельно ниже.
const NAV_ITEMS = [
  { key: "map", to: "/journeys", end: true },
  { key: "movements", to: "/journeys/movements", end: false },
  { key: "all", to: "/journeys/all", end: false },
  { key: "wishlist", to: "/journeys/wishlist", end: false },
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
        {NAV_ITEMS.map((item) => (
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
        ))}
        <NavLink
          to="/journeys/add"
          className={({ isActive }) =>
            isActive ? "journeys-nav__add journeys-nav__add--active" : "journeys-nav__add"
          }
        >
          {t("nav.add")}
        </NavLink>
      </nav>
    </section>
  );
}
