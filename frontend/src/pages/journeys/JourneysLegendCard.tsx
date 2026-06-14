import { useState } from "react";
import { useTranslation } from "react-i18next";

import { JourneysLegend } from "./JourneysLegend";
import { MAP_TONE } from "./journeys-data";
import { isLegendCollapsed, setLegendCollapsed } from "./legendStorage";

/**
 * Плавающая карточка легенды в углу карты. Сворачивается/разворачивается по
 * клику на заголовок; выбор запоминается (localStorage) и применяется при
 * следующих заходах — кто запомнил цвета, легенду больше не видит.
 */
export function JourneysLegendCard() {
  const { t } = useTranslation("journeys");
  const [collapsed, setCollapsed] = useState(isLegendCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      setLegendCollapsed(next);
      return next;
    });
  };

  return (
    <aside className="journeys-legend-card journeys-card">
      <button
        type="button"
        className="journeys-legend-card__toggle"
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        {t("legendLabel")}
        <span
          className={
            collapsed
              ? "journeys-legend-card__chevron"
              : "journeys-legend-card__chevron journeys-legend-card__chevron--open"
          }
          aria-hidden="true"
        />
      </button>

      {!collapsed && <JourneysLegend tone={MAP_TONE} />}
    </aside>
  );
}
