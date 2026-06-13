import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Полноэкранный fallback корневого `ErrorBoundary`: держит UI от белого экрана при краше рендера. */
export function RootErrorFallback() {
  const { t } = useTranslation(["common", "errors"]);

  return (
    <Center mih="100vh" p="md">
      <Stack align="center" gap="sm" maw={420}>
        <Title order={2} size="h3" c="slate.8">
          {t("error.title", { ns: "common" })}
        </Title>
        <Text c="dimmed" ta="center">
          {t("fallback", { ns: "errors" })}
        </Text>
        <Button variant="light" onClick={() => window.location.reload()}>
          {t("error.reload", { ns: "common" })}
        </Button>
      </Stack>
    </Center>
  );
}
