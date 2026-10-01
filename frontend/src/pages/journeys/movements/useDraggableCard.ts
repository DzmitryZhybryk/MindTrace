import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import { placeCard, type Box } from "./cardPlacement";
import { readControlsPosition, saveControlsPosition, type CardPosition } from "./controlsPosition";

// Шаг сдвига карточки стрелкой с клавиатуры, px.
const KEYBOARD_STEP_PX = 24;

const KEYBOARD_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEYBOARD_STEP_PX, 0],
  ArrowRight: [KEYBOARD_STEP_PX, 0],
  ArrowUp: [0, -KEYBOARD_STEP_PX],
  ArrowDown: [0, KEYBOARD_STEP_PX],
};

interface DraggableCard {
  /** Положение карточки; пустой объект — пока не измерено, место из CSS. */
  style: CSSProperties;
  /** Обработчики ушка: перетаскивание, стрелки, двойной клик — сброс в угол по умолчанию. */
  handleProps: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
}

function boxOf(element: HTMLElement): Box {
  return { left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * Ставит карточку на ближайшее допустимое к `wanted` место (см. placeCard); без `wanted` —
 * в левый нижний угол рамки. Панель учитывается, только если лежит в той же области карты.
 */
function resolvePosition(wanted: CardPosition | null, card: HTMLElement, panel: HTMLElement | null): CardPosition | null {
  const area = card.offsetParent;
  if (!(area instanceof HTMLElement)) {
    return null;
  }

  const overhangTop = Math.max(
    0,
    ...Array.from(card.children, (child) => (child instanceof HTMLElement ? -child.offsetTop : 0)),
  );
  const layout = {
    area: { width: area.clientWidth, height: area.clientHeight },
    card: { width: card.offsetWidth, height: card.offsetHeight },
    overhangTop,
    panel: panel && panel.offsetParent === area ? boxOf(panel) : null,
  };
  // Левый нижний угол: дальше всего вниз и влево — ограничения рамки поставят на место.
  return placeCard(wanted ?? { left: 0, top: layout.area.height }, layout);
}

/**
 * Перетаскиваемая карточка поверх области карты: тянут за ушко, положение запоминается.
 *
 * Карточка держится в рамке, выровненной по панели навигации, и не наезжает на панель — ни при
 * перетаскивании, ни когда окно стало меньше. На мобильной ширине карточка в потоке
 * (`position: static`), и сдвиги там не действуют.
 */
export function useDraggableCard(
  cardRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): DraggableCard {
  // Куда пользователь поставил карточку сам; `null` — не ставил, место по умолчанию.
  const [wanted, setWanted] = useState<CardPosition | null>(readControlsPosition);
  const [placed, setPlaced] = useState<CardPosition | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; origin: CardPosition } | null>(null);

  const place = useCallback(
    (next: CardPosition | null) => {
      const card = cardRef.current;
      /* v8 ignore next 3 -- зовётся из эффекта и обработчиков ушка, когда карточка уже смонтирована */
      if (!card) {
        return null;
      }

      const position = resolvePosition(next, card, panelRef.current);
      setPlaced(position);
      return position;
    },
    [cardRef, panelRef],
  );

  // Место пересчитывается при каждом изменении размера области карты: панель и края двигаются с ней.
  useLayoutEffect(() => {
    const area = cardRef.current?.offsetParent;
    place(wanted);
    if (!(area instanceof HTMLElement)) {
      return;
    }

    const observer = new ResizeObserver(() => place(wanted));
    observer.observe(area);
    return () => observer.disconnect();
  }, [cardRef, place, wanted]);

  const settle = useCallback(
    (next: CardPosition) => {
      const position = place(next);
      setWanted(position);
      saveControlsPosition(position);
    },
    [place],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const card = cardRef.current;
      if (!card || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      dragStart.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: { left: card.offsetLeft, top: card.offsetTop },
      };
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      // Карточка едет за указателем на тот же сдвиг, что прошёл указатель от точки захвата.
      const target = (pointer: globalThis.PointerEvent): CardPosition | null => {
        const start = dragStart.current;
        return start
          ? {
              left: start.origin.left + pointer.clientX - start.pointerX,
              top: start.origin.top + pointer.clientY - start.pointerY,
            }
          : null;
      };
      const onMove = (moveEvent: globalThis.PointerEvent) => {
        const next = target(moveEvent);
        if (next) {
          place(next);
        }
      };
      const onEnd = (endEvent: globalThis.PointerEvent) => {
        const next = target(endEvent);
        if (next) {
          settle(next);
        }

        dragStart.current = null;
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [cardRef, place, settle],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const step = KEYBOARD_STEPS[event.key];
      const card = cardRef.current;
      if (!step || !card) {
        return;
      }

      event.preventDefault();
      settle({ left: card.offsetLeft + step[0], top: card.offsetTop + step[1] });
    },
    [cardRef, settle],
  );

  const onDoubleClick = useCallback(() => {
    setWanted(null);
    saveControlsPosition(null);
  }, []);

  const style: CSSProperties = placed ? { left: placed.left, top: placed.top, bottom: "auto" } : {};
  return { style, handleProps: { onPointerDown, onKeyDown, onDoubleClick } };
}
