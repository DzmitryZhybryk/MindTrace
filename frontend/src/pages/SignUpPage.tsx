import { Anchor, Button, Checkbox, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthHeader } from "../components/AuthHeader";
import { AuthCard } from "../components/AuthCard";
import { AuthLayout } from "../components/AuthLayout";
import { register } from "../api/auth";
import { applyApiError, resolveErrorToken, withLocalizedError } from "../api/errors";
import { useAuth } from "../auth/useAuth";

type SignUpFormValues = {
  username: string;
  email: string;
  password: string;
  termsAccepted: boolean;
  marketingEmailsConsent: boolean;
};

export function SignUpPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignUpFormValues>({
    mode: "uncontrolled",
    initialValues: {
      username: "",
      email: "",
      password: "",
      termsAccepted: false,
      marketingEmailsConsent: false,
    },
    // Валидаторы возвращают i18n-ТОКЕН (`auth:validation.*`), а не готовый текст:
    // резолв в строку делается при рендере (`withLocalizedError`), поэтому уже
    // показанная ошибка переключается на новый язык вместе с интерфейсом.
    validate: {
      username: (value) => {
        const trimmed = value.trim();
        if (trimmed.length < 3) return "auth:validation.usernameMin";
        if (trimmed.length > 50) return "auth:validation.usernameMax";
        return null;
      },
      email: (value) => {
        if (!/^\S+@\S+\.\S+$/u.test(value)) return "auth:validation.emailInvalid";
        if (value.length > 254) return "auth:validation.emailTooLong";
        return null;
      },
      password: (value) => {
        if (value.length < 8) return "auth:validation.passwordMin";
        if (value.length > 50) return "auth:validation.passwordMax";
        return null;
      },
      termsAccepted: (value) => (value ? null : "auth:validation.termsRequired"),
    },
  });

  const [termsAccepted, setTermsAccepted] = useState(false);
  form.watch("termsAccepted", ({ value }) => setTermsAccepted(value));

  const handleSubmit = async (values: SignUpFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await register(values);
      setAccessToken(accessToken);
      navigate("/");
    } catch (err) {
      setFormError(applyApiError(err, form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      header={
        <AuthHeader
          hint={t("signup.headerHint")}
          actionLabel={t("signup.headerAction")}
          actionHref="/login"
        />
      }
    >
      <AuthCard title={t("signup.title")} subtitle={t("signup.subtitle")}>
        {formError && (
          <Text size="sm" c="red" fw={500}>
            {resolveErrorToken(formError)}
          </Text>
        )}

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label={t("signup.usernameLabel")}
              placeholder={t("signup.usernamePlaceholder")}
              size="md"
              radius="md"
              autoComplete="username"
              name="username"
              key={form.key("username")}
              {...withLocalizedError(form.getInputProps("username"))}
            />

            <TextInput
              label={t("signup.emailLabel")}
              placeholder={t("signup.emailPlaceholder")}
              size="md"
              radius="md"
              autoComplete="email"
              name="email"
              key={form.key("email")}
              {...withLocalizedError(form.getInputProps("email"))}
            />

            <PasswordInput
              label={t("signup.passwordLabel")}
              placeholder={t("signup.passwordPlaceholder")}
              size="md"
              radius="md"
              autoComplete="new-password"
              name="password"
              key={form.key("password")}
              {...withLocalizedError(form.getInputProps("password"))}
            />

            <Checkbox
              size="sm"
              color="var(--brand-ink)"
              key={form.key("termsAccepted")}
              {...withLocalizedError(form.getInputProps("termsAccepted", { type: "checkbox" }))}
              label={
                <Trans
                  t={t}
                  i18nKey="signup.terms"
                  components={{
                    tos: <Anchor href="/terms" target="_blank" rel="noopener noreferrer" />,
                    privacy: (
                      <Anchor href="/privacy" target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                />
              }
            />

            <Checkbox
              size="sm"
              color="var(--brand-ink)"
              label={t("signup.marketing")}
              key={form.key("marketingEmailsConsent")}
              {...form.getInputProps("marketingEmailsConsent", { type: "checkbox" })}
            />

            <Button
              type="submit"
              size="md"
              radius="md"
              fullWidth
              mt="xs"
              color="var(--brand-ink)"
              disabled={!termsAccepted}
              loading={submitting}
            >
              {t("signup.submit")}
            </Button>
          </Stack>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
