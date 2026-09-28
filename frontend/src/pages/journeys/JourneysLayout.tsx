import { Outlet, useLocation } from "react-router";

import { AppHeader } from "../../components/AppHeader";
import { JourneysPanel } from "./JourneysPanel";
import "./journeys.css";

/**
 * Каркас раздела Journeys: общая шапка и постоянная левая панель под-навигации.
 * Контент конкретной под-вкладки (карта / списки / добавление) подставляется
 * через <Outlet/>, поэтому шапка и панель не перемонтируются при переключении.
 *
 * На добавлении поездки оболочка получает модификатор `journeys-shell--globe`: там
 * глобус — app-global `PersistentGlobeHost` ПОД оболочкой, и она должна пропускать его
 * сквозь себя (см. journeys.css).
 */
export function JourneysLayout() {
  const { pathname } = useLocation();
  const shellClassName = pathname.startsWith("/journeys/add")
    ? "app-shell journeys-shell journeys-shell--globe"
    : "app-shell journeys-shell";

  return (
    <div className={shellClassName}>
      <AppHeader />

      <main className="journeys-stage">
        <JourneysPanel />
        <Outlet />
      </main>
    </div>
  );
}
