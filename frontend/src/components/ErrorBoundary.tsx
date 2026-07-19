import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Ловит ошибки рендера в поддереве и показывает `fallback` вместо краша всего UI.
 *
 * React не даёт boundary-функцию — нужен класс. Логирование намеренно не делаем
 * здесь (console запрещён правилами; в dev React и так печатает стек). Корневой
 * boundary держит белый экран от падения, локальный (вокруг `PersistentGlobe`) изолирует
 * сбой WebGL/three.js, не ломая форму.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
