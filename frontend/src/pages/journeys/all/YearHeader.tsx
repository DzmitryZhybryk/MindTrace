import { useEffect, useRef, useState } from "react";

interface YearHeaderProps {
  id: string;
  year: number;
  /** Сдвиг по вертикали, px, пока строку несут через этот год. */
  shift: number;
}

/** Ближайший прокручиваемый предок; `null` — прокручивается сама страница. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
  }

  return null;
}

/**
 * Заголовок года в ленте; прилипает к верху, пока его поездки на экране.
 *
 * Фон у заголовка только прилипшего — под него уезжают строки. В остальное время он прозрачный,
 * как и строки, иначе лента читалась бы зеброй. Прилипший заголовок стоит на пиксель выше края
 * прокрутки (`top: -1px`), поэтому наблюдатель видит его не целиком.
 */
export function YearHeader({ id, year, shift }: YearHeaderProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const header = ref.current;
    /* v8 ignore next 3 -- заголовок рендерится вместе с эффектом */
    if (!header) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) =>
        setIsStuck(
          entry.intersectionRatio < 1 && entry.rootBounds !== null && entry.boundingClientRect.top < entry.rootBounds.top,
        ),
      { root: scrollParentOf(header), threshold: [1] },
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <h2
      ref={ref}
      id={id}
      className="year-header"
      data-stuck={isStuck || undefined}
      style={shift === 0 ? undefined : { transform: `translateY(${shift}px)` }}
    >
      {year}
    </h2>
  );
}
