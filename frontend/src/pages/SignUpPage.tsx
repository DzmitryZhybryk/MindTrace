import {
  Anchor,
  Box,
  Button,
  Center,
  Checkbox,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthHeader } from "../components/AuthHeader";
import { AuthGlobe } from "../components/AuthGlobe";
import { register } from "../api/auth";
import { applyApiError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";

type SignUpFormValues = {
  username: string;
  email: string;
  password: string;
  termsAccepted: boolean;
  marketingEmailsConsent: boolean;
};

export function SignUpPage() {
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
    validate: {
      username: (value) => {
        const trimmed = value.trim();
        if (trimmed.length < 3) return "Username must be at least 3 characters";
        if (trimmed.length > 50) return "Username must be at most 50 characters";
        return null;
      },
      email: (value) => {
        if (!/^\S+@\S+\.\S+$/.test(value)) return "Enter a valid email";
        if (value.length > 254) return "Email is too long";
        return null;
      },
      password: (value) => {
        if (value.length < 8) return "Password must be at least 8 characters";
        if (value.length > 50) return "Password must be at most 50 characters";
        return null;
      },
      termsAccepted: (value) =>
        value ? null : "You must accept the terms to continue",
    },
  });

  const [termsAccepted, setTermsAccepted] = useState(false);
  form.watch("termsAccepted", ({ value }) => setTermsAccepted(value));

  const handleSubmit = async (values: SignUpFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const { access_token } = await register(values);
      setAccessToken(access_token);
      navigate("/");
    } catch (err) {
      setFormError(applyApiError(err, form));
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
            hint="Already have an account?"
            actionLabel="Sign In"
            actionHref="/login"
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
                  Create account
                </Title>
                <Box c="dimmed" fz="sm">
                  Start your journey with MyJourney
                </Box>
              </Stack>

              {formError && (
                <Text size="sm" c="red" fw={500}>
                  {formError}
                </Text>
              )}

              <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                  <TextInput
                    label="Username"
                    placeholder="johndoe"
                    size="md"
                    radius="md"
                    autoComplete="username"
                    key={form.key("username")}
                    {...form.getInputProps("username")}
                  />

                  <TextInput
                    label="Email"
                    placeholder="you@example.com"
                    size="md"
                    radius="md"
                    autoComplete="email"
                    key={form.key("email")}
                    {...form.getInputProps("email")}
                  />

                  <PasswordInput
                    label="Password"
                    placeholder="At least 8 characters"
                    size="md"
                    radius="md"
                    autoComplete="new-password"
                    key={form.key("password")}
                    {...form.getInputProps("password")}
                  />

                  <Checkbox
                    size="sm"
                    color="#0a1230"
                    key={form.key("termsAccepted")}
                    {...form.getInputProps("termsAccepted", { type: "checkbox" })}
                    label={
                      <>
                        I agree to the{" "}
                        <Anchor href="/terms" target="_blank" rel="noopener noreferrer">
                          Terms of Service
                        </Anchor>{" "}
                        and{" "}
                        <Anchor href="/privacy" target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </Anchor>
                      </>
                    }
                  />

                  <Checkbox
                    size="sm"
                    color="#0a1230"
                    label="Send me product updates and news by email"
                    key={form.key("marketingEmailsConsent")}
                    {...form.getInputProps("marketingEmailsConsent", { type: "checkbox" })}
                  />

                  <Button
                    type="submit"
                    size="md"
                    radius="md"
                    fullWidth
                    mt="xs"
                    color="#0a1230"
                    disabled={!termsAccepted}
                    loading={submitting}
                  >
                    Create account
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
