import { useTranslation } from "react-i18next";

import "./soon-badge.css";

/**
 * Компактный pill-бейдж «Soon» для ещё не реализованных, отключённых пунктов
 * навигации и действий. Текст берётся из common-namespace (единый источник,
 * переключается вместе с языком) — бейдж переиспользуется в шапке и в панели
 * раздела, поэтому не тянет за собой namespace вызывающего компонента.
 */
export function SoonBadge() {
  const { t } = useTranslation("common");

  return <span className="soon-badge">{t("badge.soon")}</span>;
}
