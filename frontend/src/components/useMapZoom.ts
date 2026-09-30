import { useEffect, useRef, useState, type RefObject } from "react";

import { isWorldView, panView, zoomView, type ViewBox } from "./worldProjection";

// Насколько меняется масштаб за пиксель прокрутки колеса или щипка тачпада.
const WHEEL_ZOOM_SPEED = 0.01;

/** Safari присылает щипок тачпада не колесом с `ctrlKey`, а нестандартным GestureEvent. */
interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

interface ScreenPosition {
  x: number;
  y: number;
}

function distance(from: ScreenPosition, to: ScreenPosition): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Масштаб и сдвиг карты жестами — только над самой картой, остальная страница на месте.
 *
 * Приближают щипком тачпада (колесо с `ctrlKey`, в Safari — GestureEvent) и двумя
 * пальцами на сенсорном экране; приближенную карту двигают перетаскиванием и прокруткой.
 * Двойной клик возвращает стартовый вид. Пока видна вся карта, прокрутка и вертикальный
 * свайп достаются странице.
 *
 * Жесты слушаются на `canvasRef`; по размеру `svgRef` на экране пиксели переводятся в
 * единицы холста. Новый `initialView` сбрасывает масштаб. Возвращает текущую видимую область.
 */
export function useMapZoom(
  canvasRef: RefObject<HTMLElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
  initialView: ViewBox,
): ViewBox {
  const [trackedInitialView, setTrackedInitialView] = useState(initialView);
  const [view, setView] = useState(initialView);
  if (trackedInitialView !== initialView) {
    setTrackedInitialView(initialView);
    setView(initialView);
  }

  // Обработчики подписаны один раз, а текущий и стартовый вид читают отсюда.
  const viewRef = useRef(view);
  const initialViewRef = useRef(initialView);
  useEffect(() => {
    viewRef.current = view;
    initialViewRef.current = initialView;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    /* v8 ignore next 3 -- оба узла рендерятся вместе с картой, эффект после монтирования */
    if (!canvas || !svg) {
      return;
    }

    const apply = (next: ViewBox) => {
      viewRef.current = next;
      setView(next);
    };

    // Сколько единиц холста в экранном пикселе и какая точка холста под экранной точкой.
    const unitsPerPx = () => viewRef.current.width / svg.getBoundingClientRect().width;
    const toCanvas = (clientX: number, clientY: number): ScreenPosition => {
      const rect = svg.getBoundingClientRect();
      const scale = viewRef.current.width / rect.width;
      return {
        x: viewRef.current.x + (clientX - rect.left) * scale,
        y: viewRef.current.y + (clientY - rect.top) * scale,
      };
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const anchor = toCanvas(event.clientX, event.clientY);
        apply(zoomView(viewRef.current, Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED), anchor.x, anchor.y));
        return;
      }

      if (isWorldView(viewRef.current)) {
        return;
      }

      event.preventDefault();
      const scale = unitsPerPx();
      apply(panView(viewRef.current, event.deltaX * scale, event.deltaY * scale));
    };

    let gestureStart: { view: ViewBox; anchor: ScreenPosition } | null = null;
    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      const gesture = event as SafariGestureEvent;
      gestureStart = { view: viewRef.current, anchor: toCanvas(gesture.clientX, gesture.clientY) };
    };
    const handleGestureChange = (event: Event) => {
      event.preventDefault();
      if (gestureStart) {
        const { scale } = event as SafariGestureEvent;
        apply(zoomView(gestureStart.view, scale, gestureStart.anchor.x, gestureStart.anchor.y));
      }
    };
    const handleGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureStart = null;
    };

    // Активные касания и нажатая кнопка мыши: одно — сдвиг, два — щипок.
    const pointers = new Map<number, ScreenPosition>();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }

      const current = { x: event.clientX, y: event.clientY };
      const other = [...pointers].find(([pointerId]) => pointerId !== event.pointerId)?.[1];
      if (other) {
        const before = distance(previous, other);
        if (before > 0) {
          const anchor = toCanvas((current.x + other.x) / 2, (current.y + other.y) / 2);
          apply(zoomView(viewRef.current, distance(current, other) / before, anchor.x, anchor.y));
        }
      } else if (!isWorldView(viewRef.current)) {
        const scale = unitsPerPx();
        apply(panView(viewRef.current, (previous.x - current.x) * scale, (previous.y - current.y) * scale));
      }

      pointers.set(event.pointerId, current);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };
    const handleDoubleClick = () => apply(initialViewRef.current);

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("gesturestart", handleGestureStart);
    canvas.addEventListener("gesturechange", handleGestureChange);
    canvas.addEventListener("gestureend", handleGestureEnd);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerEnd);
    canvas.addEventListener("pointercancel", handlePointerEnd);
    canvas.addEventListener("dblclick", handleDoubleClick);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("gesturestart", handleGestureStart);
      canvas.removeEventListener("gesturechange", handleGestureChange);
      canvas.removeEventListener("gestureend", handleGestureEnd);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerEnd);
      canvas.removeEventListener("pointercancel", handlePointerEnd);
      canvas.removeEventListener("dblclick", handleDoubleClick);
    };
  }, [canvasRef, svgRef]);

  return view;
}
