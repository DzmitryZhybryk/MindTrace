import { Button, Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES } from "../i18n";

interface LanguageSwitcherProps {
  /**
   * Доп. класс на кнопку. Нужен, чтобы стилизовать переключатель под тёмный фон
   * (напр. на лендинге через переопределение Mantine `--button-*` переменных) —
   * дефолтный `subtle`/`gray` рассчитан на светлые шапки и на тёмном не читается.
   */
  className?: string;
}

/**
 * Переключатель языка. Список опций строится из `SUPPORTED_LANGUAGES`, поэтому
 * добавление нового языка в реестр автоматически появляется здесь — править
 * компонент не нужно. Выбор сохраняется в localStorage детектором i18next.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps = {}) {
  const { i18n, t } = useTranslation("common");
  const currentCode = i18n.resolvedLanguage ?? SUPPORTED_LANGUAGES[0].code;
  const current =
    SUPPORTED_LANGUAGES.find((language) => language.code === currentCode) ?? SUPPORTED_LANGUAGES[0];

  const handleSelect = (code: string) => {
    if (code !== currentCode) {
      void i18n.changeLanguage(code);
    }
  };

  return (
    <Menu position="bottom-end" withArrow shadow="md" radius="md" width={160}>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          size="sm"
          radius="md"
          className={className}
          aria-label={t("language.label")}
        >
          {current.code.toUpperCase()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("language.label")}</Menu.Label>
        {SUPPORTED_LANGUAGES.map((language) => (
          <Menu.Item
            key={language.code}
            onClick={() => handleSelect(language.code)}
            fw={language.code === current.code ? 700 : 400}
          >
            {language.nativeName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
