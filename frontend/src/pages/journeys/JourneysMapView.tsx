import { WorldMap } from "../../components/WorldMap";
import { JourneysLegendCard } from "./JourneysLegendCard";
import { JOURNEYS_COUNTRIES, MAP_TONE } from "./journeys-data";

/**
 * Под-вкладка «Карта путешествий» — индексный маршрут /journeys. Карта мира и её
 * сворачиваемая легенда; рендерится в <Outlet/> каркаса JourneysLayout.
 */
export function JourneysMapView() {
  return (
    <>
      <WorldMap className="journeys-map" countries={JOURNEYS_COUNTRIES} tone={MAP_TONE} />
      <JourneysLegendCard />
    </>
  );
}
