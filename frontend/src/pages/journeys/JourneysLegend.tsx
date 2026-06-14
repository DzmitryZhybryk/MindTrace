import type { WorldMapTone } from "../../components/WorldMap";

interface JourneysLegendProps {
  tone: WorldMapTone;
}

const ITEMS = [
  { key: "visited", label: "Visited" },
  { key: "wishlist", label: "Wishlist" },
  { key: "notVisited", label: "Not visited" },
  { key: "city", label: "City" },
] as const;

/**
 * Легенда карты. Цвета берёт из переданного тона, поэтому swatch'и всегда
 * совпадают с тем, чем реально залита карта.
 */
export function JourneysLegend({ tone }: JourneysLegendProps) {
  const swatchColor: Record<(typeof ITEMS)[number]["key"], string> = {
    visited: tone.visited,
    wishlist: tone.wishlist,
    notVisited: tone.land,
    city: tone.cityDot,
  };

  return (
    <ul className="journeys-legend">
      {ITEMS.map((item) => (
        <li key={item.key} className="journeys-legend__item">
          <span
            className={item.key === "city" ? "journeys-legend__dot" : "journeys-legend__swatch"}
            style={{ backgroundColor: swatchColor[item.key], borderColor: tone.border }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
