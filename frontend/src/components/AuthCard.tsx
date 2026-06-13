import { Box, Paper, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Карточка auth-форм (login/signup): общий Paper с заголовком и подзаголовком. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <Paper
      radius="lg"
      p={40}
      withBorder
      style={{
        width: "100%",
        maxWidth: 420,
        borderColor: "var(--auth-card-border)",
        backgroundColor: "var(--auth-card-bg)",
        boxShadow: "var(--auth-card-shadow)",
      }}
    >
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2} size="h3" c="slate.8">
            {title}
          </Title>
          <Box c="dimmed" fz="sm">
            {subtitle}
          </Box>
        </Stack>
        {children}
      </Stack>
    </Paper>
  );
}
