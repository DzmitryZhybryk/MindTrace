import type { CSSProperties } from "react";

interface BrandGlobeGlyphProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * Глиф-глобус, стоящий вместо «o» в слове MyJourney (graticule: контур + меридиан +
 * экватор). Вектор, а не растр — чёткий на любом кегле и без CDN-зависимости.
 *
 * Контур на `currentColor` и без заливки: марка наследует цвет текста, поэтому одна
 * и та же разметка работает в обеих шапках — публичной и приложения. Размер задаёт
 * потребитель (em-единицами от кегля слова).
 */
export function BrandGlobeGlyph({ className, style }: BrandGlobeGlyphProps) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className} style={style}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="6" />
      <ellipse cx="50" cy="50" rx="18" ry="46" fill="none" stroke="currentColor" strokeWidth="4" />
      <line x1="6" y1="50" x2="94" y2="50" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
