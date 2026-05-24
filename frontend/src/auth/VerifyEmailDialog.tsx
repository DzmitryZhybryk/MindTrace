import { Button, Group, Modal, PinInput, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";

import { refresh, sendEmailVerification, verifyEmail } from "../api/auth";
import { ApiError, messageForCode } from "../api/errors";
import { setAccessToken } from "./tokenStore";

type Stage = "intro" | "code";

type VerifyEmailDialogProps = {
  opened: boolean;
  onClose: () => void;
  onVerified: () => void;
};

const CODE_LENGTH = 6;

export function VerifyEmailDialog({ opened, onClose, onVerified }: VerifyEmailDialogProps) {
  const [stage, setStage] = useState<Stage>("intro");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setStage("intro");
      setCode("");
      setError(null);
      setSubmitting(false);
    }
  }, [opened]);

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
          onVerified();
          onClose();
          return;
        }

        setError(messageForCode(err.code));
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await verifyEmail({ code });
      await syncVerifiedClaim();
      onVerified();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Email уже подтверждён — закрываем и синкаем.
          await syncVerifiedClaim();
          onVerified();
          onClose();
          return;
        }

        // 410 (expired), 404 (not found), 429 (attempts exceeded) — откатываем
        // на стадию "intro", чтобы пользователь мог запросить новый код.
        const shouldResetToIntro = err.status === 410 || err.status === 404 || err.status === 429;
        setError(messageForCode(err.code));
        if (shouldResetToIntro) {
          setStage("intro");
          setCode("");
        }
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      radius="lg"
      title={
        <Title order={3} size="h4" c="slate.8">
          Verify your email
        </Title>
      }
    >
      <Stack gap="md">
        {stage === "intro" ? (
          <>
            <Text size="sm" c="dimmed">
              We'll send a 6-digit code to your email. Enter it here to confirm your address.
            </Text>
            {error && (
              <Text size="sm" c="red" fw={500}>
                {error}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={submitting}>
                Later
              </Button>
              <Button onClick={handleSendCode} loading={submitting}>
                Send code
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              We sent a code to your email. Enter the 6 digits below.
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
                aria-label="Email verification code"
              />
            </Group>

            {error && (
              <Text size="sm" c="red" ta="center" fw={500}>
                {error}
              </Text>
            )}

            <Group justify="space-between">
              <Button variant="subtle" onClick={handleSendCode} disabled={submitting}>
                Resend code
              </Button>
              <Button onClick={handleVerify} loading={submitting}>
                Verify
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
    const { access_token } = await refresh();
    setAccessToken(access_token);
  } catch {
    // Refresh может упасть, если refresh-cookie истёк; UI всё равно
    // получит актуальное состояние при следующем логине.
  }
}
