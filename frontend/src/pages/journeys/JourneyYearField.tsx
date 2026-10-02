import { Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { resolveErrorToken } from "../../api/errors";
import type { JourneyFormValues } from "./JourneyForm";

const YEARS_BACK = 100;

interface JourneyYearFieldProps {
  form: UseFormReturnType<JourneyFormValues>;
}

/** Год поездки: список от текущего года на 100 лет назад. */
export function JourneyYearField({ form }: JourneyYearFieldProps) {
  const { t } = useTranslation("journeys");
  const values = form.getValues();

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: YEARS_BACK + 1 }, (_, i) => String(currentYear - i));

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t("addJourney.date.legend")}
      </Text>

      <Select
        placeholder={t("addJourney.date.yearPlaceholder")}
        size="md"
        radius="md"
        searchable
        data={yearOptions}
        value={values.year}
        onChange={(value) => {
          form.setFieldValue("year", value);
          form.clearFieldError("year");
        }}
        error={resolveErrorToken(form.errors.year)}
      />
    </Stack>
  );
}
