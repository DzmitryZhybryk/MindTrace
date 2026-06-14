import { Outlet } from "react-router-dom";

import { AppHeader } from "../../components/AppHeader";
import { JourneysPanel } from "./JourneysPanel";
import "./journeys.css";

/**
 * Каркас раздела Journeys: общая шапка и постоянная левая панель под-навигации.
 * Контент конкретной под-вкладки (карта / списки / добавление) подставляется
 * через <Outlet/>, поэтому шапка и панель не перемонтируются при переключении.
 */
export function JourneysLayout() {
  return (
    <div className="app-shell">
      <AppHeader />

      <main className="journeys-stage">
        <JourneysPanel />
        <Outlet />
      </main>
    </div>
  );
}
