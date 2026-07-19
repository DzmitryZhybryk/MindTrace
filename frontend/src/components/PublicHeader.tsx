import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";
import "./public-header.css";

/**
 * Шапка публичной зоны (лендинг + login/signup). Смонтирована один раз в
 * `PublicLayout`, поэтому переживает навигацию вместе с глобусом — при переходе
 * лендинг → форма она не перерисовывается, что и держит ощущение одного мира.
 *
 * Активная пилюля выводится из маршрута: на `/signup` подсвечена «Sign up», на
 * `/login` — «Log in», на лендинге по умолчанию «Sign up» как главное действие.
 */
export function PublicHeader() {
  const { t } = useTranslation("landing");
  const { pathname } = useLocation();
  const isLogin = pathname.startsWith("/login");

  return (
    <header className="public-header">
      <BrandMark to="/" />
      <nav className="public-header__nav" aria-label={t("nav.label")}>
        <LanguageSwitcher className="public-header__lang" />
        <div className="public-header__pills">
          <Link
            to="/signup"
            className={isLogin ? "public-header__pill" : "public-header__pill is-active"}
          >
            {t("nav.signup")}
          </Link>
          <Link
            to="/login"
            className={isLogin ? "public-header__pill is-active" : "public-header__pill"}
          >
            {t("nav.login")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
