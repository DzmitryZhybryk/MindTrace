import { vi } from "vitest";

/** Прямоугольник элемента на экране, px. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Размеры элемента в раскладке (`offset*`) и класс его `offsetParent`. */
export interface OffsetBox {
  /** Без них положение берётся из инлайн-стиля `left`/`top` — его задаёт перетаскивание. */
  left?: number;
  top?: number;
  width: number;
  height: number;
  /** Класс ближайшего предка, относительно которого элемент позиционирован. */
  parentClass?: string;
}

function offsetBoxOf(element: Element, boxesByClass: Readonly<Record<string, OffsetBox>>): OffsetBox | undefined {
  return Object.entries(boxesByClass).find(([className]) => element.classList.contains(className))?.[1];
}

/**
 * Задаёт элементам по CSS-классу раскладку `offset*` / `client*`: в jsdom её нет — у всех
 * нулевые размеры и `offsetParent === null`. `clientWidth`/`clientHeight` равны размеру box.
 * Снимается `vi.restoreAllMocks()`.
 */
export function stubOffsetLayout(boxesByClass: Readonly<Record<string, OffsetBox>>): void {
  const position = (element: HTMLElement, side: "left" | "top"): number =>
    offsetBoxOf(element, boxesByClass)?.[side] ?? (Number.parseFloat(element.style[side]) || 0);
  const size = (element: HTMLElement, side: "width" | "height"): number =>
    offsetBoxOf(element, boxesByClass)?.[side] ?? 0;

  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function parentOf(this: HTMLElement) {
    const parentClass = offsetBoxOf(this, boxesByClass)?.parentClass;
    return parentClass ? this.closest(`.${parentClass}`) : null;
  });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function leftOf(this: HTMLElement) {
    return position(this, "left");
  });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function topOf(this: HTMLElement) {
    return position(this, "top");
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function widthOf(this: HTMLElement) {
    return size(this, "width");
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function heightOf(this: HTMLElement) {
    return size(this, "height");
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function clientWidthOf(this: Element) {
    return this instanceof HTMLElement ? size(this, "width") : 0;
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function clientHeightOf(this: Element) {
    return this instanceof HTMLElement ? size(this, "height") : 0;
  });
}

/**
 * Задаёт экранные прямоугольники элементам по их CSS-классу: в jsdom нет раскладки, и
 * `getBoundingClientRect` у всех возвращает нули. Элемент без класса из карты — нулевой.
 * Снимается `vi.restoreAllMocks()`.
 */
export function stubScreenLayout(rectsByClass: Readonly<Record<string, ScreenRect>>): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rectOf(this: Element) {
    const known = Object.entries(rectsByClass).find(([className]) => this.classList.contains(className))?.[1];
    const { left, top, width, height } = known ?? { left: 0, top: 0, width: 0, height: 0 };
    return DOMRect.fromRect({ x: left, y: top, width, height });
  });
}
