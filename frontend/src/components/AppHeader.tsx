import { Avatar, Group, Indicator, Menu, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { logout } from "../api/auth";
import { useAuth } from "../auth/useAuth";
import { BrandMark } from "./BrandMark";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { LanguageSwitcher } from "./LanguageSwitcher";
import "./app-header.css";

const TABS = [
  { key: "journeys", to: "/journeys" },
  { key: "mind", to: "/mind" },
] as const;

/**
 * Шапка приложения, общая для всех внутренних экранов (Home, Journeys, ...).
 * Держит бренд, первичную навигацию с подсветкой активного раздела, выбор
 * языка и меню профиля (logout идемпотентен на бэке). Под шапкой рендерит
 * баннер верификации email — единая точка, чтобы он не дублировался по страницам.
 */
export function AppHeader() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { emailVerified, clearSession, openVerifyDialog } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Logout идемпотентен на бэке (204 даже без cookie); сетевая ошибка
      // не должна оставить пользователя залогиненным локально.
    } finally {
      clearSession();
      navigate("/login");
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header__brand">
          <BrandMark />
        </div>

        <nav className="app-tabs" aria-label={t("nav.ariaPrimary")}>
          {TABS.map((tab) => {
            const isActive = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            return (
              <Link
                key={tab.key}
                to={tab.to}
                className={isActive ? "app-tab app-tab--active" : "app-tab"}
                aria-current={isActive ? "page" : undefined}
              >
                {t(`nav.${tab.key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="app-header__user">
          <Group gap="xs" align="center">
            <LanguageSwitcher />
            <Menu position="bottom-end" withArrow shadow="md" radius="md" width={200}>
              <Menu.Target>
                <UnstyledButton aria-label={t("profile.menuButton")} className="app-avatar-button">
                  <Indicator
                    disabled={emailVerified}
                    color="yellow"
                    size={10}
                    offset={4}
                    withBorder
                  >
                    <Avatar radius="xl" size="md" color="slate" name="Dzmitry Zhybryk" />
                  </Indicator>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{t("profile.account")}</Menu.Label>
                <Menu.Item>{t("profile.profile")}</Menu.Item>
                {!emailVerified && (
                  <Menu.Item onClick={openVerifyDialog}>{t("profile.verifyEmail")}</Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item color="red" onClick={handleLogout}>
                  {t("profile.logout")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </header>

      {!emailVerified && <EmailVerificationBanner onVerifyClick={openVerifyDialog} />}
    </>
  );
}
