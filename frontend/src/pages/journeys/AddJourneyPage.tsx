import { useForm } from "@mantine/form";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useGlobeSceneActions, type GlobeSlot } from "../../components/globe/globeScene";
import type { GlobeRoute } from "../../components/globe/route";
import { JourneyForm } from "./JourneyForm";
import { JOURNEY_FORM_VALIDATE, type JourneyFormValues } from "./journeyFormRules";

/**
 * Slot rectangle in viewport coordinates; zero size (column hidden on a narrow screen via
 * `display: none`) means "no room for the globe".
 */
function measureSlot(element: HTMLElement): GlobeSlot | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * "Add journey" sub-tab, route /journeys/add. Two-panel screen: the form on the left, a slot for
 * the hero globe on the right that draws the route live from input. The globe itself is the
 * app-global `PersistentGlobeHost`: the page only publishes the route and its column rectangle,
 * so leaving for /home is a flight of the same planet, not a swap of two. Rendered in the
 * <Outlet/> of the JourneysLayout shell.
 */
export function AddJourneyPage() {
  const { t } = useTranslation("journeys");
  const { setRoute, setSlot } = useGlobeSceneActions();
  const slotRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<JourneyFormValues>({
    mode: "controlled",
    initialValues: {
      origin: null,
      destination: null,
      transport: null,
      year: null,
    },
    validate: JOURNEY_FORM_VALIDATE,
  });

  const { origin, destination, transport } = form.getValues();

  // Route identity follows its fields, not the render: a controlled form rerenders on every input
  // (e.g. picking a year), and a new object each render would make the host run for nothing.
  const route = useMemo<GlobeRoute>(
    () => ({
      origin,
      destination,
      transportType: transport,
      originLabel: origin?.name?.trim() ?? "",
      destinationLabel: destination?.name?.trim() ?? "",
    }),
    [origin, destination, transport],
  );

  useEffect(() => {
    setRoute(route);
  }, [route, setRoute]);

  useEffect(() => () => setRoute(null), [setRoute]);

  // Measure the slot by its size (ResizeObserver: in-flow banner, breakpoint change) and by the
  // window (a column shift without a size change is invisible to ResizeObserver).
  useEffect(() => {
    const element = slotRef.current;
    if (!element) return;

    const publish = () => setSlot(measureSlot(element));
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);
    publish();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      setSlot(null);
    };
  }, [setSlot]);

  return (
    <div className="add-journey">
      <div className="add-journey__form-col">
        <section className="add-journey__card journeys-card" aria-label={t("addJourney.title")}>
          <h1 className="add-journey__title">{t("addJourney.title")}</h1>
          <p className="add-journey__subtitle">{t("addJourney.subtitle")}</p>
          <JourneyForm form={form} />
        </section>
      </div>

      {/* Empty globe slot: gestures pass through to the planet (contract in persistent-globe.css). */}
      <div ref={slotRef} className="add-journey__globe-col" data-globe-slot />
    </div>
  );
}
