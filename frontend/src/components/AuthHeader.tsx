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
      wrap="nowrap"
      gap="sm"
      px={{ base: "md", sm: "xl" }}
      py="md"
      style={{ backgroundColor: "transparent" }}
    >
      <BrandMark />

      <Group gap="sm" align="center" wrap="nowrap">
        <LanguageSwitcher />
        {/* Хинт «уже есть аккаунт?» прячем на узких — кнопка действия рядом самодостаточна. */}
        <Text size="sm" c="dimmed" visibleFrom="sm">
          {hint}
        </Text>
        <Button component={Link} to={actionHref} variant="default" size="md" radius="md">
          {actionLabel}
        </Button>
      </Group>
    </Group>
  );
}
