import { Avatar, Burger, Drawer, Group, Indicator, Menu, Stack, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
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

// Имя профиля захардкожено: бэк пока не отдаёт профиль (в JWT только sub / exp /
// email_verified). Заменить на данные пользователя, когда появится эндпоинт /me.
const PLACEHOLDER_PROFILE_NAME = "Dzmitry Zhybryk";

/**
 * Шапка приложения, общая для всех внутренних экранов (Home, Journeys, ...).
 * Держит бренд, первичную навигацию с подсветкой активного раздела, выбор
 * языка и меню профиля (logout идемпотентен на бэке). Под шапкой рендерит
 * баннер верификации email — единая точка, чтобы он не дублировался по страницам.
 *
 * На узких экранах (<sm) первичная навигация уезжает в бургер-Drawer, чтобы шапка
 * не переполнялась; язык и профиль остаются в шапке.
 */
export function AppHeader() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { emailVerified, clearSession, openVerifyDialog } = useAuth();
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

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

  const isTabActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <>
      <header className="app-header">
        <div className="app-header__brand">
          <BrandMark />
        </div>

        <nav className="app-tabs" aria-label={t("nav.ariaPrimary")}>
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to}
              className={isTabActive(tab.to) ? "app-tab app-tab--active" : "app-tab"}
              aria-current={isTabActive(tab.to) ? "page" : undefined}
            >
              {t(`nav.${tab.key}`)}
            </Link>
          ))}
        </nav>

        <div className="app-header__user">
          <Group gap="xs" align="center" wrap="nowrap">
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
                    <Avatar radius="xl" size="md" color="slate" name={PLACEHOLDER_PROFILE_NAME} />
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

            <Burger
              opened={drawerOpened}
              onClick={openDrawer}
              hiddenFrom="md"
              size="sm"
              aria-label={t("nav.ariaPrimary")}
            />
          </Group>
        </div>
      </header>

      <Drawer opened={drawerOpened} onClose={closeDrawer} position="right" size="78%" padding="lg">
        <Stack gap="xs">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to}
              onClick={closeDrawer}
              className={
                isTabActive(tab.to) ? "app-drawer-link app-drawer-link--active" : "app-drawer-link"
              }
              aria-current={isTabActive(tab.to) ? "page" : undefined}
            >
              {t(`nav.${tab.key}`)}
            </Link>
          ))}
        </Stack>
      </Drawer>

      {!emailVerified && <EmailVerificationBanner onVerifyClick={openVerifyDialog} />}
    </>
  );
}
