import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Полноэкранный fallback корневого `ErrorBoundary`: держит UI от белого экрана при краше рендера. */
export function RootErrorFallback() {
  const { t } = useTranslation(["common", "errors"]);

  return (
    <Center mih="100vh" p="md">
      <Stack align="center" gap="sm" maw={420}>
        {/* Семантический токен, а не оттенок палитры: поверхность продукта — ночь, и `slate.8`
            (#1e293b) давал здесь контраст ~1.3:1, то есть заголовок краш-экрана был не виден. */}
        <Title order={2} size="h3" style={{ color: "var(--text)" }}>
          {t("error.title", { ns: "common" })}
        </Title>
        <Text c="var(--text-muted)" ta="center">
          {t("fallback", { ns: "errors" })}
        </Text>
        <Button variant="light" onClick={() => window.location.reload()}>
          {t("error.reload", { ns: "common" })}
        </Button>
      </Stack>
    </Center>
  );
}
