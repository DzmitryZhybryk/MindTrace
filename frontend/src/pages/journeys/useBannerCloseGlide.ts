import { useLayoutEffect, type RefObject } from "react";

import { prefersReducedMotion } from "../../components/reducedMotion";

// The same glide as the globe and the home greeting: `--dur-glide` / `--ease-glide` in index.css.
const GLIDE_MS = 1300;
const GLIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
// Below it the section stacks and scrolls; the jump is the page's ordinary reflow there.
const DESKTOP_QUERY = "(min-width: 62em)";
// Layers anchored to the stage top. Bottom-anchored ones (legend, credit, the movements card in its
// default corner) do not move when the stage grows upward.
const TOP_LAYERS = ".journeys-panel, .all-journeys__column, .add-journey";
const MAP_CANVAS = ".journeys-map .world-map-canvas";

/**
 * Closing the email banner makes the stage grow upward at once (the banner is in flow above it).
 * This plays that jump as a glide: right after the layout, before paint, the top layers start where
 * they were and slide up, and the map grows from its old height. Only `transform` is animated, and
 * the layout itself stays real, so everything that measures it (the map frame, the movements card,
 * the globe slot) settles on the final positions at once.
 */
export function useBannerCloseGlide(stageRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const stage = stageRef.current;
    /* v8 ignore next 3 -- the stage renders with the layout, the effect runs after mount */
    if (!stage) {
      return;
    }

    let previousTop = stage.getBoundingClientRect().top;
    const observer = new ResizeObserver(() => {
      const top = stage.getBoundingClientRect().top;
      const shift = previousTop - top;
      previousTop = top;
      // Only a jump up: the banner appearing (shift < 0) moves the content down with no animation.
      if (shift <= 0 || prefersReducedMotion() || !window.matchMedia(DESKTOP_QUERY).matches) {
        return;
      }

      const timing: KeyframeAnimationOptions = { duration: GLIDE_MS, easing: GLIDE_EASING };
      for (const layer of stage.querySelectorAll<HTMLElement>(TOP_LAYERS)) {
        layer.animate?.([{ transform: `translateY(${shift}px)` }, { transform: "none" }], timing);
      }

      const canvas = stage.querySelector<HTMLElement>(MAP_CANVAS);
      const height = canvas?.getBoundingClientRect().height ?? 0;
      if (canvas && height > shift) {
        // The map is height-constrained, so scaling it from the bottom shows it at its old height.
        canvas.animate?.(
          [
            { transform: `scale(${(height - shift) / height})`, transformOrigin: "50% 100%" },
            { transform: "none", transformOrigin: "50% 100%" },
          ],
          timing,
        );
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef]);
}
