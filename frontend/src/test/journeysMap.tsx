import { useMemo, useRef, type ReactElement } from "react";
import { Link, Outlet, Route, Routes } from "react-router";

import { AllJourneysView } from "../pages/journeys/all/AllJourneysView";
import type { JourneysOutletContext } from "../pages/journeys/JourneysLayout";
import { JourneysMapHost } from "../pages/journeys/map/JourneysMapHost";
import { JourneysMapSceneProvider } from "../pages/journeys/map/JourneysMapSceneProvider";
import { renderWithProviders, screen, within } from "./render";

export interface JourneysTab {
  path: string;
  /** `null`: a screen with no content of its own, as the wishlist placeholder in App.tsx. */
  element: ReactElement | null;
}

/**
 * The part of the Journeys shell a tab depends on: the shared map with its scene channel and the
 * panel ref passed through `<Outlet context>`. Without the header, so no auth or user request.
 * A link per path (named by the path) lets a test switch tabs the way a user does.
 */
function JourneysMapShell({ paths }: { paths: readonly string[] }) {
  const panelRef = useRef<HTMLElement>(null);
  const context = useMemo<JourneysOutletContext>(() => ({ panelRef }), []);
  return (
    <JourneysMapSceneProvider>
      <nav>
        {paths.map((path) => (
          <Link key={path} to={path}>
            {path}
          </Link>
        ))}
      </nav>
      <JourneysMapHost />
      <Outlet context={context} />
    </JourneysMapSceneProvider>
  );
}

/** The feed tab alone, as its scenario-split test files render it. */
export function renderAllJourneys() {
  return renderJourneysTabs([{ path: "/journeys/all", element: <AllJourneysView /> }]);
}

/** Opens the feed and editing of the Moscow -> London row (`FEED_JOURNEYS[0]`) by clicking its departure place. */
export async function openMoscowToLondonEditor() {
  const rendered = renderAllJourneys();
  const year2021 = await screen.findByRole("region", { name: "2021" });
  await rendered.user.click(await within(year2021).findByRole("button", { name: "Moscow" }));
  await screen.findByRole("button", { name: "Save" });
  return rendered;
}

/** Renders Journeys tabs under the shared map, starting at `route` (the first tab by default). */
export function renderJourneysTabs(tabs: readonly JourneysTab[], route = tabs[0].path) {
  return renderWithProviders(
    <Routes>
      <Route element={<JourneysMapShell paths={tabs.map((tab) => tab.path)} />}>
        {tabs.map((tab) => (
          <Route key={tab.path} path={tab.path} element={tab.element} />
        ))}
      </Route>
    </Routes>,
    { route },
  );
}
