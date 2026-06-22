import { ActionIcon, Button, Group, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { dismissVerifyBanner, isVerifyBannerDismissed } from "../auth/verifyBannerStorage";

type EmailVerificationBannerProps = {
  onVerifyClick: () => void;
};

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
        backgroundColor: "rgba(255, 244, 214, 0.92)",
        borderBottom: "1px solid rgba(217, 175, 78, 0.35)",
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
        <Text size="sm" c="slate.8" ta="center">
          {t("verificationBanner.message")}
        </Text>
        <Button
          size="xs"
          variant="filled"
          color="slate"
          onClick={onVerifyClick}
          style={{ flexShrink: 0 }}
        >
          {t("verificationBanner.action")}
        </Button>
      </Group>
      {/* × — dismiss в правом гаттере (в reserved-паддинге, не наезжает на кластер). */}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={t("verificationBanner.dismissLabel")}
        onClick={handleDismiss}
        style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }}
      >
        ×
      </ActionIcon>
    </section>
  );
}
