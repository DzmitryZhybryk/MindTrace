import { Anchor, Button, Checkbox, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import {
  authCheckboxClassNames,
  authInputClassNames,
  authPasswordClassNames,
} from "../components/authInputClasses";
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

  // `controlled` (а не `uncontrolled`), потому что от значений полей зависит рендер:
  // кнопка отправки гаснет, пока форма не заполнена (см. `canSubmit` ниже).
  const form = useForm<SignUpFormValues>({
    mode: "controlled",
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

  // Кнопка ждёт ЗАПОЛНЕННОСТИ, а не валидности: правила (длина, формат) проверяются по
  // сабмиту и объясняют себя сообщением под полем. Гаси кнопку по валидности — и
  // пользователь упирался бы в мёртвую кнопку, не понимая, что именно не так.
  // Согласие с условиями — часть этого минимума, согласие на рассылку добровольно.
  const formValues = form.getValues();
  const canSubmit =
    formValues.username.trim().length > 0 &&
    formValues.email.trim().length > 0 &&
    formValues.password.length > 0 &&
    formValues.termsAccepted;

  const handleSubmit = async (values: SignUpFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await register(values);
      setAccessToken(accessToken);
      navigate("/home");
    } catch (err) {
      setFormError(applyApiError(err, form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Форма слева — сфера на этом экране уводится вправо (persistent-globe.css).
    <AuthLayout side="left">
      <AuthCard title={t("signup.title")} subtitle={t("signup.subtitle")}>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label={t("signup.usernameLabel")}
              placeholder={t("signup.usernamePlaceholder")}
              size="md"
              radius="md"
              autoComplete="username"
              name="username"
              classNames={authInputClassNames}
              {...withLocalizedError(form.getInputProps("username"))}
            />

            <TextInput
              label={t("signup.emailLabel")}
              placeholder={t("signup.emailPlaceholder")}
              size="md"
              radius="md"
              autoComplete="email"
              name="email"
              classNames={authInputClassNames}
              {...withLocalizedError(form.getInputProps("email"))}
            />

            <PasswordInput
              label={t("signup.passwordLabel")}
              placeholder={t("signup.passwordPlaceholder")}
              size="md"
              radius="md"
              autoComplete="new-password"
              name="password"
              classNames={authPasswordClassNames}
              {...withLocalizedError(form.getInputProps("password"))}
            />

            <Checkbox
              size="sm"
              classNames={authCheckboxClassNames}
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
              classNames={authCheckboxClassNames}
              label={t("signup.marketing")}
              {...form.getInputProps("marketingEmailsConsent", { type: "checkbox" })}
            />

            {/* Ошибка операции (409, сеть) — у кнопки, а не в шапке карточки: правило
                «UI error display» держит operation-scoped сообщение рядом с действием,
                которое его вызвало. `role="alert"` озвучивает провал скринридеру —
                узел появляется по условию, поэтому срабатывает именно на ошибку. */}
            {formError && (
              <p className="auth-card__error" role="alert">
                {resolveErrorToken(formError)}
              </p>
            )}

            <Button
              type="submit"
              size="md"
              radius="md"
              fullWidth
              mt="xs"
              className="auth-submit"
              disabled={!canSubmit}
              loading={submitting}
            >
              {t("signup.submit")}
            </Button>
          </Stack>
        </form>

        <p className="auth-card__switch">
          {t("signup.headerHint")} <Link to="/login">{t("signup.headerAction")}</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
