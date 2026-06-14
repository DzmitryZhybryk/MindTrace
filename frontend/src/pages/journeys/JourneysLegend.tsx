import { useTranslation } from "react-i18next";

import type { WorldMapTone } from "../../components/WorldMap";

interface JourneysLegendProps {
  tone: WorldMapTone;
}

const ITEM_KEYS = ["visited", "wishlist", "notVisited", "city"] as const;

/**
 * Легенда карты. Цвета берёт из переданного тона, поэтому swatch'и всегда
 * совпадают с тем, чем реально залита карта.
 */
export function JourneysLegend({ tone }: JourneysLegendProps) {
  const { t } = useTranslation("journeys");
  const swatchColor: Record<(typeof ITEM_KEYS)[number], string> = {
    visited: tone.visited,
    wishlist: tone.wishlist,
    notVisited: tone.land,
    city: tone.cityDot,
  };

  return (
    <ul className="journeys-legend">
      {ITEM_KEYS.map((key) => (
        <li key={key} className="journeys-legend__item">
          <span
            className={key === "city" ? "journeys-legend__dot" : "journeys-legend__swatch"}
            style={{ backgroundColor: swatchColor[key], borderColor: tone.border }}
          />
          {t(`legend.${key}`)}
        </li>
      ))}
    </ul>
  );
}
