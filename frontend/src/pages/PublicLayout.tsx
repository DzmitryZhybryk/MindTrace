import { PublicHeader } from "../components/PublicHeader";
import { PublicCrossfade } from "./PublicCrossfade";
import "./public-layout.css";

/**
 * Каркас публичной зоны: общая шапка + контент через `<Outlet/>` (кросс-фейдом).
 *
 * Глобус-фон здесь БОЛЬШЕ НЕ монтируется — он поднят на корень приложения
 * (`PersistentGlobeHost` в `App`), общий для публичной и авторизованной зон, и переживает
 * навигацию между ними (в т.ч. login → home), поэтому WebGL не перезагружается. Контент этой
 * зоны прозрачен и лежит НАД фиксированным глобусом (z-index в `public-layout.css`).
 *
 * Контент идёт через `PublicCrossfade`, а не напрямую через `<Outlet/>`: он держит уходящий
 * экран смонтированным на время фейда и несёт собственный `Suspense`, чтобы загрузка чанка
 * соседней страницы не размонтировала лейаут.
 */
export function PublicLayout() {
  return (
    <div className="public-layout">
      <PublicHeader />
      {/* Ландмарк `main`: обёртка одна на все три экрана, поэтому во время кросс-фейда двух
          `main` в документе не возникает. */}
      <main className="public-layout__content">
        <PublicCrossfade />
      </main>
    </div>
  );
}
