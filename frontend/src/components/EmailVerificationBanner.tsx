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
    <div
      role="region"
      aria-label={t("verificationBanner.regionLabel")}
      style={{
        position: "relative",
        width: "100%",
        backgroundColor: "rgba(255, 244, 214, 0.92)",
        borderBottom: "1px solid rgba(217, 175, 78, 0.35)",
        padding: "10px 32px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Сообщение + Verify now — единым кластером по центру полосы. */}
      <Group gap="md" align="center" wrap="nowrap">
        <Text size="sm" c="slate.8">
          {t("verificationBanner.message")}
        </Text>
        <Button size="xs" variant="filled" color="slate" onClick={onVerifyClick}>
          {t("verificationBanner.action")}
        </Button>
      </Group>
      {/* × — dismiss в правом углу (right:32px = гаттер хедера, под аватаром).
          Вне потока, чтобы не сбивать центрирование кластера. */}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={t("verificationBanner.dismissLabel")}
        onClick={handleDismiss}
        style={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)" }}
      >
        ×
      </ActionIcon>
    </div>
  );
}
