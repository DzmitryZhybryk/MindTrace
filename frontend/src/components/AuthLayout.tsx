import type { ReactNode } from "react";

import "./auth-layout.css";

interface AuthLayoutProps {
  /** Сторона, с которой всплывает форма. Парная кадрированию сферы (см. ниже). */
  side: "left" | "right";
  children: ReactNode;
}

/**
 * Каркас auth-экрана «Уровня 3»: тонкий позиционер формы поверх персистентного
 * глобуса из `PublicLayout`. Собственного глобуса и шапки здесь нет — и то, и другое
 * смонтировано выше по дереву и переживает навигацию, поэтому переход лендинг →
 * форма читается перелётом камеры, а не загрузкой новой страницы.
 *
 * `side` задан явно, а не выведен из маршрута: он парный к кадрированию сферы в
 * `persistent-globe.css` (`data-screen` уводит глобус в ПРОТИВОПОЛОЖНЫЙ край), и
 * менять одну половину пары без второй нельзя — явный проп держит это на виду.
 */
export function AuthLayout({ side, children }: AuthLayoutProps) {
  return (
    <div className="auth-layout" data-side={side}>
      <div className="auth-layout__inner">{children}</div>
    </div>
  );
}
