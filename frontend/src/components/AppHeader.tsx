import { Avatar, Burger, Drawer, Group, Indicator, Menu, Stack, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";

import { logout } from "../api/auth";
import { useAuth } from "../auth/useAuth";
import { useCurrentUser } from "../user/useCurrentUser";
import { BrandMark } from "./BrandMark";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SoonBadge } from "./SoonBadge";
import "./app-header.css";

// `soon: true` — раздел ещё не реализован: таб рендерится неактивным (не ссылка)
// с бейджем «Soon». Так пункт остаётся видимым как анонс, но не ведёт в никуда.
const TABS = [
  { key: "journeys", to: "/journeys", soon: false },
  { key: "mind", to: "/mind", soon: true },
] as const;

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
  const currentUser = useCurrentUser();
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

  // Пока профиль не загружен, name=undefined — Mantine Avatar рендерит генерик-иконку
  // вместо инициалов.
  const profileName =
    currentUser.status === "ready"
      ? (currentUser.user.displayName ?? currentUser.user.username)
      : undefined;

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
          <BrandMark to="/home" />
        </div>

        <nav className="app-tabs" aria-label={t("nav.ariaPrimary")}>
          {TABS.map((tab) =>
            tab.soon ? (
              <span
                key={tab.key}
                className="app-tab app-tab--soon"
                aria-disabled="true"
                title={t("badge.comingSoon")}
              >
                {t(`nav.${tab.key}`)}
                <SoonBadge />
              </span>
            ) : (
              <Link
                key={tab.key}
                to={tab.to}
                className={isTabActive(tab.to) ? "app-tab app-tab--active" : "app-tab"}
                aria-current={isTabActive(tab.to) ? "page" : undefined}
              >
                {t(`nav.${tab.key}`)}
              </Link>
            ),
          )}
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
                    <Avatar radius="xl" size="md" color="slate" name={profileName} />
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
          {TABS.map((tab) =>
            tab.soon ? (
              <span
                key={tab.key}
                className="app-drawer-link app-drawer-link--soon"
                aria-disabled="true"
              >
                {t(`nav.${tab.key}`)}
                <SoonBadge />
              </span>
            ) : (
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
            ),
          )}
        </Stack>
      </Drawer>

      {!emailVerified && <EmailVerificationBanner onVerifyClick={openVerifyDialog} />}
    </>
  );
}
