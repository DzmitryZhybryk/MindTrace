import { Button, Group, Modal, PinInput, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { refresh, sendEmailVerification, verifyEmail } from "../api/auth";
import { ApiError, errorCodeToken, resolveErrorToken } from "../api/errors";
import { setAccessToken } from "./tokenStore";

type Stage = "intro" | "code";

interface VerifyEmailDialogProps {
  opened: boolean;
  onClose: () => void;
  onVerified?: () => void;
}

const CODE_LENGTH = 6;

export function VerifyEmailDialog({ opened, onClose, onVerified }: VerifyEmailDialogProps) {
  const { t } = useTranslation(["auth", "errors"]);
  const [stage, setStage] = useState<Stage>("intro");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Сброс состояния делаем в обработчике закрытия (а не в эффекте на `opened`),
  // чтобы следующее открытие стартовало с чистой стадии "intro".
  const handleClose = () => {
    setStage("intro");
    setCode("");
    setError(null);
    setSubmitting(false);
    onClose();
  };

  const handleSendCode = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await sendEmailVerification();
      setStage("code");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Email уже подтверждён в другой сессии/вкладке — синхронизируем токен.
          await syncVerifiedClaim();
          onVerified?.();
          handleClose();
          return;
        }

        setError(errorCodeToken(err.code));
      } else {
        setError(errorCodeToken("network"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) {
      setError("auth:verifyEmail.codeIncomplete");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await verifyEmail({ code });
      await syncVerifiedClaim();
      onVerified?.();
      handleClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Email уже подтверждён — закрываем и синкаем.
          await syncVerifiedClaim();
          onVerified?.();
          handleClose();
          return;
        }

        // 410 (expired), 404 (not found), 429 (attempts exceeded) — откатываем
        // на стадию "intro", чтобы пользователь мог запросить новый код.
        const shouldResetToIntro = err.status === 410 || err.status === 404 || err.status === 429;
        setError(errorCodeToken(err.code));
        if (shouldResetToIntro) {
          setStage("intro");
          setCode("");
        }
      } else {
        setError(errorCodeToken("network"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      radius="lg"
      title={
        // Modal оборачивает title в свой <h2> — внутри должен быть НЕ заголовок (иначе
        // <h2><h3> = невалидный HTML + дублирующий heading для скринридера). Text сохраняет вид.
        <Text size="h4" fw={700} style={{ color: "var(--text)" }}>
          {t("verifyEmail.title")}
        </Text>
      }
    >
      <Stack gap="md">
        {stage === "intro" ? (
          <>
            <Text size="sm" c="var(--text-muted)">
              {t("verifyEmail.intro")}
            </Text>
            {error && (
              <Text size="sm" fw={500} c="var(--text-error)" role="alert">
                {resolveErrorToken(error)}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={handleClose} disabled={submitting}>
                {t("verifyEmail.later")}
              </Button>
              <Button onClick={handleSendCode} loading={submitting}>
                {t("verifyEmail.sendCode")}
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm" c="var(--text-muted)">
              {t("verifyEmail.codeSent")}
            </Text>

            <Group justify="center">
              <PinInput
                length={CODE_LENGTH}
                type="number"
                oneTimeCode
                value={code}
                onChange={(value) => {
                  setError(null);
                  setCode(value);
                }}
                size="md"
                aria-label={t("verifyEmail.codeInputLabel")}
              />
            </Group>

            {error && (
              <Text size="sm" fw={500} ta="center" c="var(--text-error)" role="alert">
                {resolveErrorToken(error)}
              </Text>
            )}

            <Group justify="space-between">
              <Button variant="subtle" onClick={handleSendCode} disabled={submitting}>
                {t("verifyEmail.resendCode")}
              </Button>
              <Button onClick={handleVerify} loading={submitting}>
                {t("verifyEmail.verify")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

/**
 * После успешной верификации бэк не возвращает новый access-токен,
 * а email_verified claim в текущем токене остаётся false. Подтягиваем
 * свежий токен через /v1/auth/refresh/, чтобы UI-состояние сошлось с
 * фактическим состоянием на бэке.
 */
async function syncVerifiedClaim(): Promise<void> {
  try {
    const { accessToken } = await refresh();
    setAccessToken(accessToken);
  } catch {
    // Refresh может упасть, если refresh-cookie истёк; UI всё равно
    // получит актуальное состояние при следующем логине.
  }
}
