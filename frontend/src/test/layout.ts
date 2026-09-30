import { vi } from "vitest";

/** Прямоугольник элемента на экране, px. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Задаёт экранные прямоугольники элементам по их CSS-классу: в jsdom нет раскладки, и
 * `getBoundingClientRect` у всех возвращает нули. Элемент без класса из карты — нулевой.
 * Заодно заглушает захват указателя, которого в jsdom нет. Снимается `vi.restoreAllMocks()`.
 */
export function stubScreenLayout(rectsByClass: Readonly<Record<string, ScreenRect>>): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rectOf(this: Element) {
    const known = Object.entries(rectsByClass).find(([className]) => this.classList.contains(className))?.[1];
    const { left, top, width, height } = known ?? { left: 0, top: 0, width: 0, height: 0 };
    return DOMRect.fromRect({ x: left, y: top, width, height });
  });
  Element.prototype.setPointerCapture = vi.fn();
}
