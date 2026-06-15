import { Button, Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { applyApiError } from "../../api/errors";
import { createJourney, type CitySuggestion, type TransportType } from "../../api/journeys";
import { CityAutocomplete } from "../../components/CityAutocomplete";
import { JourneyDateField } from "./JourneyDateField";

const TRANSPORT_TYPES: readonly TransportType[] = ["land", "air", "water"];

export type JourneyFormValues = {
  origin: CitySuggestion | null;
  destination: CitySuggestion | null;
  transport: TransportType | null;
  year: string | null;
  month: string | null;
  day: string | null;
  hasMonth: boolean;
  hasDay: boolean;
};

interface JourneyFormProps {
  form: UseFormReturnType<JourneyFormValues>;
}

/**
 * Форма добавления поездки: откуда/куда (автокомплит), транспорт и приблизительная
 * дата. `form` поднят в AddJourneyPage, чтобы глобус-герой реагировал на ввод
 * вживую. Города и реальный сабмит к `/v1/journeys` подключаются следующими шагами.
 */
export function JourneyForm({ form }: JourneyFormProps) {
  const { t } = useTranslation("journeys");
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (values: JourneyFormValues) => {
    if (!values.origin || !values.destination || !values.transport || !values.year) {
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await createJourney({
        originGeonameId: values.origin.geonameId,
        destinationGeonameId: values.destination.geonameId,
        transportType: values.transport,
        traveledYear: Number(values.year),
        traveledMonth: values.hasMonth && values.month ? Number(values.month) : null,
        traveledDay: values.hasDay && values.day ? Number(values.day) : null,
      });
      navigate("/journeys");
    } catch (err) {
      // Ошибка операции (не привязана к полю) — на уровне формы, у кнопки сабмита.
      const message = applyApiError(err, form);
      if (message) {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const values = form.getValues();

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        <CityAutocomplete
          label={t("addJourney.origin.label")}
          placeholder={t("addJourney.origin.placeholder")}
          description={t("addJourney.cityComingSoon")}
          value={values.origin}
          onChange={(city) => form.setFieldValue("origin", city)}
          error={form.errors.origin}
        />

        <CityAutocomplete
          label={t("addJourney.destination.label")}
          placeholder={t("addJourney.destination.placeholder")}
          value={values.destination}
          onChange={(city) => form.setFieldValue("destination", city)}
          error={form.errors.destination}
        />

        <Select
          label={t("addJourney.transport.label")}
          placeholder={t("addJourney.transport.placeholder")}
          size="md"
          radius="md"
          data={TRANSPORT_TYPES.map((type) => ({ value: type, label: t(`addJourney.transport.${type}`) }))}
          value={values.transport}
          onChange={(value) => {
            form.setFieldValue("transport", value as TransportType | null);
            form.clearFieldError("transport");
          }}
          error={form.errors.transport}
        />

        <JourneyDateField form={form} />

        {formError && (
          <Text size="sm" c="red" fw={500}>
            {formError}
          </Text>
        )}

        <Button type="submit" size="md" radius="md" fullWidth mt="xs" loading={submitting}>
          {t("addJourney.submit")}
        </Button>
      </Stack>
    </form>
  );
}
