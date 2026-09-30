import { WORLD_ASPECT, WORLD_VIEW_BOX, clampView, type ViewBox } from "./worldProjection";

/** Размер области карты на экране, px. */
interface CanvasSize {
  width: number;
  height: number;
}

// Поля вокруг содержимого — доля его размера с каждой стороны.
const PADDING_RATIO = 0.15;
// Содержимое уже этой доли мира не растягивается: одна короткая поездка не заполняет весь экран.
const MIN_CONTENT_WIDTH_RATIO = 0.25;

/**
 * Подбирает видимую область так, чтобы `bounds` (в единицах холста) целиком поместились
 * в ту часть области карты, которую ничто не закрывает.
 *
 * Карта вписана по высоте, а лишняя ширина обрезана поровну с краёв, поэтому видимую часть
 * считаем в пикселях, а не в долях холста. `occludedLeft` — сколько пикселей слева закрыто
 * (панелью навигации).
 */
export function fitView(bounds: ViewBox, canvas: CanvasSize, occludedLeft: number): ViewBox {
  const svgWidth = canvas.height * WORLD_ASPECT;
  // Сдвиг от левого края области карты к левому краю SVG (отрицательный, если SVG шире).
  const svgOffset = (canvas.width - svgWidth) / 2;
  const areaLeft = Math.max(0, occludedLeft - svgOffset);
  const areaRight = Math.min(svgWidth, canvas.width - svgOffset);
  const areaWidth = areaRight - areaLeft;
  if (canvas.height <= 0 || areaWidth <= 0) {
    return WORLD_VIEW_BOX;
  }

  const contentWidth = Math.max(bounds.width * (1 + 2 * PADDING_RATIO), WORLD_VIEW_BOX.width * MIN_CONTENT_WIDTH_RATIO);
  const contentHeight = bounds.height * (1 + 2 * PADDING_RATIO);
  const unitsPerPx = Math.max(contentWidth / areaWidth, contentHeight / canvas.height);
  const width = unitsPerPx * svgWidth;
  if (width >= WORLD_VIEW_BOX.width) {
    return WORLD_VIEW_BOX;
  }

  // Центр содержимого — в центр незакрытой части; у края мира рамка сдвигается внутрь.
  return clampView({
    x: bounds.x + bounds.width / 2 - ((areaLeft + areaRight) / 2) * unitsPerPx,
    y: bounds.y + bounds.height / 2 - (canvas.height / 2) * unitsPerPx,
    width,
    height: width / WORLD_ASPECT,
  });
}
