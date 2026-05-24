import { ActionIcon, Button, Group, Text } from "@mantine/core";
import { useEffect, useState } from "react";

const DISMISS_STORAGE_KEY = "verify-banner-dismissed";

type EmailVerificationBannerProps = {
  onVerifyClick: () => void;
};

export function EmailVerificationBanner({ onVerifyClick }: EmailVerificationBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  useEffect(() => {
    // На случай, если другой таб поменял dismiss-флаг — нечастый кейс,
    // но storage event для sessionStorage не работает между табами, так что
    // полагаемся только на текущую сессию.
  }, []);

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // storage недоступен — закроем только локально на эту страницу.
    }

    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Email verification reminder"
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
          Your email isn't verified yet. Some features may be limited until you confirm it.
        </Text>
        <Button size="xs" variant="filled" color="slate" onClick={onVerifyClick}>
          Verify now
        </Button>
      </Group>
      {/* × — dismiss в правом углу (right:32px = гаттер хедера, под аватаром).
          Вне потока, чтобы не сбивать центрирование кластера. */}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Dismiss reminder for this session"
        onClick={handleDismiss}
        style={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)" }}
      >
        ×
      </ActionIcon>
    </div>
  );
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
