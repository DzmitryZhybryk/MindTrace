import { Link } from "react-router";

import { BrandGlobeGlyph } from "./BrandGlobeGlyph";
import "./brand-mark.css";

const BRAND = "MyJourney";

interface BrandMarkProps {
  /**
   * Куда ведёт марка. Различается по зонам: в приложении — на `/home`, потому что
   * залогиненного на корне ждёт редирект (лишний хоп по собственному логотипу),
   * в публичной — на `/`.
   */
  to: string;
}

/**
 * Марка MyJourney — одна на обе зоны. Раньше публичная шапка рисовала её собственной
 * разметкой, из-за чего логотип менялся в размере на переходе через логин; общим был
 * только глиф-глобус.
 *
 * Разметка держится на обычном `<Link>`, а не на Mantine `Text`: марка живёт в том числе
 * на лендинге, где из Mantine больше ничего не используется.
 */
export function BrandMark({ to }: BrandMarkProps) {
  return (
    <Link
      to={to}
      className="brand-mark"
      // Без метки марка озвучивается как «MyJurney»: глиф-глобус между «MyJ» и
      // «urney» скрыт от скринридера, а текстовые куски склеиваются.
      aria-label={BRAND}
    >
      MyJ
      <BrandGlobeGlyph className="brand-mark__globe" />
      urney
    </Link>
  );
}
