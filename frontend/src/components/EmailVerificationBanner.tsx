import { ActionIcon, Button, Group, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { dismissVerifyBanner, isVerifyBannerDismissed } from "../auth/verifyBannerStorage";

interface EmailVerificationBannerProps {
  onVerifyClick: () => void;
}

export function EmailVerificationBanner({ onVerifyClick }: EmailVerificationBannerProps) {
  const { t } = useTranslation("auth");
  const [dismissed, setDismissed] = useState<boolean>(() => isVerifyBannerDismissed());

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    dismissVerifyBanner();
    setDismissed(true);
  };

  return (
    <section
      aria-label={t("verificationBanner.regionLabel")}
      style={{
        position: "relative",
        width: "100%",
        // Информационная полоса на ночной поверхности: тонированная закатом, а не
        // залитая светлым. Кремовая заливка светлой схемы читалась ярким слепком
        // поперёк экрана и спорила с самим сообщением.
        backgroundColor: "rgba(232, 147, 92, 0.12)",
        borderBottom: "1px solid rgba(232, 147, 92, 0.28)",
        // Правый паддинг 48px резервирует гаттер под × — центрируемый кластер в него не заезжает.
        padding: "10px 48px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Сообщение + Verify now — кластер по центру. wrap:на узких кнопка переносится
          под текст (а не режется краем), flexShrink:0 — лейбл кнопки не сжимается. */}
      <Group gap="sm" align="center" justify="center" wrap="wrap" style={{ rowGap: 8 }}>
        <Text size="sm" ta="center" style={{ color: "var(--text)" }}>
          {t("verificationBanner.message")}
        </Text>
        <Button
          size="xs"
          variant="filled"
          onClick={onVerifyClick}
          // Цвет — акцент темы (primary), метка тёмная: Mantine кладёт её инлайн-переменной,
          // поэтому задаём конечным свойством, как у кнопки отправки в auth.
          style={{ flexShrink: 0, color: "var(--on-accent)" }}
        >
          {t("verificationBanner.action")}
        </Button>
      </Group>
      {/* × — dismiss в правом гаттере (в reserved-паддинге, не наезжает на кластер). */}
      <ActionIcon
        variant="subtle"
        color="gray"
        // 44px — минимальный тач-таргет (web/performance.md); умещается в 48px-гаттер (right:2).
        size={44}
        aria-label={t("verificationBanner.dismissLabel")}
        onClick={handleDismiss}
        style={{
          position: "absolute",
          right: 2,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 22,
          color: "var(--text-muted)",
        }}
      >
        ×
      </ActionIcon>
    </section>
  );
}
