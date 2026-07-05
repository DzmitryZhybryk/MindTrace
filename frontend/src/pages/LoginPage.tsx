import { Anchor, Button, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthHeader } from "../components/AuthHeader";
import { AuthCard } from "../components/AuthCard";
import { AuthLayout } from "../components/AuthLayout";
import { login } from "../api/auth";
import { applyApiError, resolveErrorToken, withLocalizedError } from "../api/errors";
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
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    mode: "uncontrolled",
    initialValues: {
      login: "",
      password: "",
    },
    // Валидаторы возвращают i18n-ТОКЕН (`auth:validation.*`), а не готовый текст:
    // резолв в строку — при рендере (`withLocalizedError`), чтобы ошибка
    // переключалась на новый язык вместе с интерфейсом.
    validate: {
      login: (value) => (value.trim().length === 0 ? "auth:validation.loginRequired" : null),
      password: (value) => (value.length === 0 ? "auth:validation.passwordRequired" : null),
    },
  });

  const handleSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await login(values);
      setAccessToken(accessToken);
      navigate("/");
    } catch (err) {
      // Ошибка операции (неверные креды, сеть) — на уровне формы, у кнопки сабмита;
      // field-bound ошибки applyApiError сам вешает на поля.
      const message = applyApiError(err, form);
      if (message) {
        setFormError(message);
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
              {...withLocalizedError(form.getInputProps("login"))}
            />

            <PasswordInput
              label={t("login.passwordLabel")}
              placeholder={t("login.passwordPlaceholder")}
              size="md"
              radius="md"
              autoComplete="current-password"
              name="password"
              key={form.key("password")}
              {...withLocalizedError(form.getInputProps("password"))}
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

            {formError && (
              <Text size="sm" c="red" fw={500}>
                {resolveErrorToken(formError)}
              </Text>
            )}

            <Button type="submit" size="md" radius="md" fullWidth mt="xs" loading={submitting}>
              {t("login.submit")}
            </Button>
          </Stack>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
