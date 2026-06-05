import {
  Anchor,
  Box,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthHeader } from "../components/AuthHeader";
import { AuthGlobe } from "../components/AuthGlobe";
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
      const { access_token } = await login(values);
      setAccessToken(access_token);
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
    <Box
      style={{
        display: "flex",
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 50% 75% at 25% 50%, #f5f8fc 0%, #dbe5f3 55%, #b8c8e0 100%)",
      }}
    >
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          position: "relative",
        }}
      >
        <Box style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1 }}>
          <AuthHeader
            hint={t("login.headerHint")}
            actionLabel={t("login.headerAction")}
            actionHref="/signup"
          />
        </Box>

        <Center style={{ flex: 1, padding: "24px", width: "100%" }}>
          <Paper
            radius="lg"
            p={40}
            withBorder
            style={{
              width: "100%",
              maxWidth: 420,
              borderColor: "#dbe2ec",
              backgroundColor: "#ffffff",
              boxShadow: "0 12px 32px rgba(15, 30, 80, 0.10)",
            }}
          >
            <Stack gap="lg">
              <Stack gap={4}>
                <Title order={2} size="h3" c="slate.8">
                  {t("login.title")}
                </Title>
                <Box c="dimmed" fz="sm">
                  {t("login.subtitle")}
                </Box>
              </Stack>

              <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                  <TextInput
                    label={t("login.loginLabel")}
                    placeholder={t("login.loginPlaceholder")}
                    size="md"
                    radius="md"
                    autoComplete="username"
                    key={form.key("login")}
                    {...form.getInputProps("login")}
                  />

                  <PasswordInput
                    label={t("login.passwordLabel")}
                    placeholder={t("login.passwordPlaceholder")}
                    size="md"
                    radius="md"
                    autoComplete="current-password"
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
            </Stack>
          </Paper>
        </Center>
      </Box>

      <Box visibleFrom="md" style={{ flex: 1, padding: 16, display: "flex" }}>
        <Box style={{ flex: 1, borderRadius: 24, overflow: "hidden" }}>
          <AuthGlobe />
        </Box>
      </Box>
    </Box>
  );
}
