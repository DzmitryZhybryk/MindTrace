import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "./reducedMotion";
import type { ViewBox } from "./worldProjection";

const TRANSITION_MS = 600;

/**
 * Плавный переход видимой области карты к новой цели — вместо прыжка.
 *
 * Новая цель посреди перехода подхватывается с того вида, что сейчас на экране. При «меньше
 * движения» и при выключенном переходе вид сменяется сразу.
 *
 * Args:
 *     target: Вид, к которому идём.
 *     isEnabled: Плавно ли переходить.
 *
 * Returns:
 *     Вид для текущего кадра.
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
      // Плавно трогается и плавно встаёт.
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
