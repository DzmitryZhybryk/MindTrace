import { Button, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { AuthCard } from "../components/AuthCard";
import { authInputClassNames, authPasswordClassNames } from "../components/authInputClasses";
import { AuthLayout } from "../components/AuthLayout";
import { applyApiError, resolveErrorToken, withLocalizedError } from "../api/errors";
import { login } from "../api/sdk";
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

  // `controlled` (а не `uncontrolled`), потому что от значений полей зависит рендер:
  // кнопка отправки гаснет, пока форма не заполнена (см. `canSubmit` ниже).
  const form = useForm<LoginFormValues>({
    mode: "controlled",
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

  // Кнопка ждёт ЗАПОЛНЕННОСТИ, а не валидности: правила (длина, формат) проверяются по
  // сабмиту и объясняют себя сообщением под полем. Гаси кнопку по валидности — и
  // пользователь упирался бы в мёртвую кнопку, не понимая, что именно не так.
  const formValues = form.getValues();
  const canSubmit = formValues.login.trim().length > 0 && formValues.password.length > 0;

  const handleSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await login({
        body: { login: values.login, password: values.password },
        throwOnError: true,
      });
      setAccessToken(accessToken);
      navigate("/home");
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
    // Форма справа — сфера на этом экране уводится влево (persistent-globe.css).
    <AuthLayout side="right">
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
              classNames={authInputClassNames}
              {...withLocalizedError(form.getInputProps("login"))}
            />

            <PasswordInput
              label={t("login.passwordLabel")}
              placeholder={t("login.passwordPlaceholder")}
              size="md"
              radius="md"
              autoComplete="current-password"
              name="password"
              classNames={authPasswordClassNames}
              {...withLocalizedError(form.getInputProps("password"))}
            />

            {/*
              Восстановление пароля ещё не реализовано. Раньше здесь стояла ссылка
              `href="#"` с `preventDefault`: она попадала в Tab-обход, озвучивалась
              скринридером как ссылка и не делала ничего — то есть обещала действие,
              которого нет. `<span>` не фокусируется и не притворяется интерактивным;
              подсказка остаётся видимой, чтобы не терять контекст поля пароля.
              Вернуть `<Anchor to="/reset-password">`, когда появится сам поток.
            */}
            <span className="auth-card__hint" style={{ alignSelf: "flex-end" }}>
              {t("login.forgotPassword")}
            </span>

            {/* `role="alert"` — иначе провал входа виден только зрячему: узел появляется
                по условию, и live-region озвучивает его в момент появления. */}
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
              {t("login.submit")}
            </Button>
          </Stack>
        </form>

        <p className="auth-card__switch">
          {t("login.headerHint")} <Link to="/signup">{t("login.headerAction")}</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
