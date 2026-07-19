import type { ReactNode } from "react";

import "./auth-card.css";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Стеклянная карточка auth-форм (login/signup) поверх персистентного глобуса.
 * Заголовок карточки — главный заголовок экрана (`h1`): шапка публичной зоны несёт
 * только логотип-ссылку, других заголовков на странице нет.
 */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <section className="auth-card">
      <h1 className="auth-card__title">{title}</h1>
      <p className="auth-card__subtitle">{subtitle}</p>
      {children}
    </section>
  );
}
