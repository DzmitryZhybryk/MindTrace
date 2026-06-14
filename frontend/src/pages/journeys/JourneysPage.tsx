import { Button } from "@mantine/core";

import { AppHeader } from "../../components/AppHeader";
import { WorldMap } from "../../components/WorldMap";
import { JourneysLegend } from "./JourneysLegend";
import { JOURNEYS_COUNTRIES, JOURNEYS_STATS, MAP_TONE } from "./journeys-data";
import "./journeys.css";

/**
 * Экран Journeys: карта мира во всю ширину под шапкой, панель управления
 * путешествиями «плавает» стеклянной карточкой поверх в левом верхнем углу.
 */
export function JourneysPage() {
  return (
    <div className="journeys-shell">
      <AppHeader />

      <main className="journeys-stage">
        <WorldMap className="journeys-map" countries={JOURNEYS_COUNTRIES} tone={MAP_TONE} />

        <section className="journeys-panel" aria-label="Journeys controls">
          <span className="journeys-panel__label">journeys</span>
          <Button disabled fullWidth color="slate" radius="md" className="journeys-panel__add">
            + Add journey
          </Button>
          <JourneysLegend tone={MAP_TONE} />
          <p className="journeys-panel__stats">
            {JOURNEYS_STATS.countries} countries · {JOURNEYS_STATS.cities} cities
          </p>
        </section>
      </main>
    </div>
  );
}
