import { Button, Group, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";

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
      py="md"
      style={{ backgroundColor: "transparent" }}
    >
      <BrandMark />

      <Group gap="sm" align="center">
        <LanguageSwitcher />
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
