import { useMemo, useRef, type RefObject } from "react";
import { Outlet, useLocation } from "react-router";

import { AppHeader } from "../../components/AppHeader";
import { JourneysPanel } from "./JourneysPanel";
import "./journeys.css";

/** Что каркас передаёт под-вкладкам через `<Outlet context>`. */
export interface JourneysOutletContext {
  /** Панель навигации: на десктопе она лежит поверх левой части карты. */
  panelRef: RefObject<HTMLElement | null>;
}

/**
 * Каркас раздела Journeys: общая шапка и постоянная левая панель под-навигации.
 * Контент конкретной под-вкладки (карта / списки / добавление) подставляется
 * через <Outlet/>, поэтому шапка и панель не перемонтируются при переключении.
 *
 * На добавлении поездки оболочка получает модификатор `journeys-shell--globe`: там
 * глобус — app-global `PersistentGlobeHost` ПОД оболочкой, и она должна быть прозрачной
 * (см. journeys.css). События к глобусу пропускает `data-globe-passthrough` — он действует,
 * только пока хост интерактивен (контракт — persistent-globe.css), поэтому стоит всегда.
 */
export function JourneysLayout() {
  const { pathname } = useLocation();
  const shellClassName = pathname.startsWith("/journeys/add")
    ? "app-shell journeys-shell journeys-shell--globe"
    : "app-shell journeys-shell";
  const panelRef = useRef<HTMLElement>(null);
  const outletContext = useMemo<JourneysOutletContext>(() => ({ panelRef }), []);

  return (
    <div className={shellClassName} data-globe-passthrough>
      <AppHeader />

      <main className="journeys-stage">
        <JourneysPanel ref={panelRef} />
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
