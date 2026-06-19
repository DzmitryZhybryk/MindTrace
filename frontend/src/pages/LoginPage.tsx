import { Anchor, Button, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthHeader } from "../components/AuthHeader";
import { AuthCard } from "../components/AuthCard";
import { AuthLayout } from "../components/AuthLayout";
import { login } from "../api/auth";
import { applyApiError } from "../api/errors";
import { useAuth } from "../auth/useAuth";

type LoginFormValues = {
  login: string;
  password: string;
};

export function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    mode: "uncontrolled",
    initialValues: {
      login: "",
      password: "",
    },
    validate: {
      login: (value) => (value.trim().length === 0 ? t("validation.loginRequired") : null),
      password: (value) => (value.length === 0 ? t("validation.passwordRequired") : null),
    },
  });

  const handleSubmit = async (values: LoginFormValues) => {
    setSubmitting(true);
    try {
      const { accessToken } = await login(values);
      setAccessToken(accessToken);
      navigate("/");
    } catch (err) {
      // Общие ошибки логина (неверные креды, сеть) показываем под полем password.
      const message = applyApiError(err, form);
      if (message) {
        form.setFieldError("password", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      header={
        <AuthHeader
          hint={t("login.headerHint")}
          actionLabel={t("login.headerAction")}
          actionHref="/signup"
        />
      }
    >
      <AuthCard title={t("login.title")} subtitle={t("login.subtitle")}>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label={t("login.loginLabel")}
              placeholder={t("login.loginPlaceholder")}
              size="md"
              radius="md"
              autoComplete="username"
              name="username"
              key={form.key("login")}
              {...form.getInputProps("login")}
            />

            <PasswordInput
              label={t("login.passwordLabel")}
              placeholder={t("login.passwordPlaceholder")}
              size="md"
              radius="md"
              autoComplete="current-password"
              name="password"
              key={form.key("password")}
              {...form.getInputProps("password")}
            />

            <Anchor
              href="#"
              size="xs"
              c="dimmed"
              style={{ alignSelf: "flex-end" }}
              onClick={(e) => e.preventDefault()}
            >
              {t("login.forgotPassword")}
            </Anchor>

            <Button type="submit" size="md" radius="md" fullWidth mt="xs" loading={submitting}>
              {t("login.submit")}
            </Button>
          </Stack>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
