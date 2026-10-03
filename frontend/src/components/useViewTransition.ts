import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "./reducedMotion";
import type { ViewBox } from "./worldProjection";

const TRANSITION_MS = 600;

/**
 * Smoothly eases the map's visible area to a new target instead of jumping.
 *
 * A new target mid-transition continues from the view currently on screen. With reduced motion,
 * or when disabled, the view changes immediately. Returns the view for the current frame.
 */
export function useViewTransition(target: ViewBox, isEnabled: boolean): ViewBox {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const isAnimated = isEnabled && !prefersReducedMotion();

  useEffect(() => {
    if (!isAnimated) {
      shownRef.current = target;
      return;
    }

    const from = shownRef.current;
    if (from === target) {
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / TRANSITION_MS, 1);
      // Ease in-out cubic.
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      const next =
        progress === 1
          ? target
          : {
              x: from.x + (target.x - from.x) * eased,
              y: from.y + (target.y - from.y) * eased,
              width: from.width + (target.width - from.width) * eased,
              height: from.height + (target.height - from.height) * eased,
            };
      shownRef.current = next;
      setShown(next);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, isAnimated]);

  return isAnimated ? shown : target;
}
