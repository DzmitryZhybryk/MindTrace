import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { prefersReducedMotion } from "../../../components/reducedMotion";

const ODOMETER_MS = 600;
const FLIP_MS = 260;

/**
 * Число, которое при смене значения докручивается до нового, как одометр.
 *
 * Первое значение показывается сразу — анимируются только изменения (например, расстояние после
 * правки поездки).
 *
 * Args:
 *     value: Целевое значение.
 *
 * Returns:
 *     Текущее показываемое значение.
 */
export function useAnimatedNumber(value: number): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const isReduced = prefersReducedMotion();

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) {
      return;
    }

    if (isReduced) {
      shownRef.current = value;
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / ODOMETER_MS, 1);
      // Плавное замедление к концу: последние цифры докручиваются медленнее.
      const eased = 1 - (1 - progress) ** 3;
      shownRef.current = from + (value - from) * eased;
      setShown(shownRef.current);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value, isReduced]);

  return isReduced ? value : shown;
}

/**
 * FLIP-анимация списка: элементы с `data-flip-id`, сменившие место после рендера, плавно
 * доезжают со старого места на новое, а новые — проявляются.
 *
 * Места замеряются после каждого рендера, поэтому анимация срабатывает на любую смену порядка —
 * фильтр, перенос, правку с другим годом. Пока `isPaused` (идёт перетаскивание — строки двигает
 * dnd-kit), только замеряем. Элементы должны быть позиционированы относительно контейнера.
 *
 * Args:
 *     containerRef: Контейнер списка.
 *     isPaused: Не анимировать в этот рендер.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, isPaused: boolean): void {
  // Место — `offsetTop` внутри ленты, а не позиция на экране: прокрутка места не меняет.
  const tops = useRef(new Map<string, number>());

  // Без массива зависимостей: замер нужен после каждого рендера, сравнивать есть с чем всегда.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const isAnimated = !isPaused && !prefersReducedMotion();
    const next = new Map<string, number>();
    for (const element of container.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const id = element.dataset.flipId ?? "";
      const top = element.offsetTop;
      next.set(id, top);

      // jsdom и старые браузеры без Web Animations — просто без анимации.
      if (!isAnimated || typeof element.animate !== "function") {
        continue;
      }

      const previous = tops.current.get(id);
      if (previous === undefined) {
        if (tops.current.size > 0) {
          element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FLIP_MS, easing: "ease-out" });
        }
        continue;
      }

      const deltaY = previous - top;
      if (Math.abs(deltaY) >= 1) {
        element.animate([{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }], {
          duration: FLIP_MS,
          easing: "ease-out",
        });
      }
    }

    tops.current = next;
  });
}
