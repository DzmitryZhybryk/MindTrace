import { Button, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

type AuthHeaderProps = {
  hint: string;
  actionLabel: string;
  actionHref: string;
};

export function AuthHeader({ hint, actionLabel, actionHref }: AuthHeaderProps) {
  return (
    <Group
      justify="space-between"
      align="center"
      px="xl"
      style={{
        minHeight: "var(--header-height)",
        backgroundColor: "transparent",
      }}
    >
      <BrandMark />

      <Group gap="sm" align="center">
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
        <Button
          component={Link}
          to={actionHref}
          variant="default"
          size="md"
          radius="md"
        >
          {actionLabel}
        </Button>
      </Group>
    </Group>
  );
}
