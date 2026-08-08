import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuth } from "../auth/useAuth";

interface PublicOnlyRouteProps {
  children: ReactNode;
}

/**
 * Зеркало `ProtectedRoute`: пускает только НЕаутентифицированного, залогиненного уводит
 * на дашборд. Нужен на всех трёх публичных маршрутах (`/`, `/login`, `/signup`) — до него
 * проверка стояла только на корне, поэтому залогиненный пользователь, открывший `/login`
 * по закладке или кнопкой «назад», получал форму входа в уже открытую сессию.
 *
 * `isBootstrapping` отдаёт `null`, а не редирект: пока сессия поднимается из refresh-cookie,
 * ещё не известно, аутентифицирован ли пользователь, и ранний редирект в любую сторону был
 * бы угадыванием.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
