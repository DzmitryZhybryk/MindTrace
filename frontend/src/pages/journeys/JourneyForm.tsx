import { Button, Group, Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { applyApiError, resolveErrorToken } from "../../api/errors";
import { createJourney, TRANSPORT_TYPES, type PlaceSuggestion, type TransportType } from "../../api/journeys";
import carIcon from "../../assets/emoji/car.svg";
import planeIcon from "../../assets/emoji/plane.svg";
import shipIcon from "../../assets/emoji/ship.svg";
import { PlaceAutocomplete } from "../../components/PlaceAutocomplete";
import { JourneyDateField } from "./JourneyDateField";

// Иконка среды передвижения для select транспорта (метка — из i18n, картинка — Noto-эмодзи SVG).
const TRANSPORT_ICONS: Record<TransportType, string> = {
  land: carIcon,
  air: planeIcon,
  water: shipIcon,
};

const TRANSPORT_ICON_SIZE = 22;

/**
 * Inline-иконка «поменять местами»: вертикальные стрелки вверх/вниз. SVG, а не Noto-эмодзи,
 * т.к. это UI-контрол — рисуем штрихом по `currentColor`, чтобы тематизировался под кнопку.
 */
function SwapVerticalIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4v15" />
      <path d="M4 7l3 -3l3 3" />
      <path d="M17 20v-15" />
      <path d="M14 17l3 3l3 -3" />
    </svg>
  );
}

export type JourneyFormValues = {
  origin: PlaceSuggestion | null;
  destination: PlaceSuggestion | null;
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
 * вживую. Сабмит строит payload из выбранных мест/транспорта/даты, шлёт POST
 * `/v1/journeys` (`createJourney`) и при успехе ведёт на `/journeys`.
 */
export function JourneyForm({ form }: JourneyFormProps) {
  const { t } = useTranslation("journeys");
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Меняем «откуда»/«куда» местами. Глобус развернёт маршрут и иконку транспорта сам —
  // его анимация завязана на порядок origin→destination. Ошибки полей сбрасываем, чтобы
  // старая валидация (например, «выберите город») не висела на перенесённом значении.
  const handleSwap = () => {
    const { origin, destination } = form.getValues();
    form.setValues({ origin: destination, destination: origin });
    form.clearFieldError("origin");
    form.clearFieldError("destination");
  };

  const handleSubmit = async (values: JourneyFormValues) => {
    if (!values.origin || !values.destination || !values.transport || !values.year) {
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await createJourney({
        origin: {
          name: values.origin.name,
          countryCode: values.origin.countryCode,
          latitude: values.origin.latitude,
          longitude: values.origin.longitude,
        },
        destination: {
          name: values.destination.name,
          countryCode: values.destination.countryCode,
          latitude: values.destination.latitude,
          longitude: values.destination.longitude,
        },
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
  const selectedTransportIcon = values.transport ? TRANSPORT_ICONS[values.transport] : null;

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        {/* Кнопка обмена лежит в DOM ПОСЛЕ обоих полей (визуально — поверх зазора между
            ними), чтобы Tab шёл «откуда → куда», не цепляя кнопку. */}
        <div className="add-journey__route">
          <Stack gap="md">
            <PlaceAutocomplete
              label={t("addJourney.origin.label")}
              placeholder={t("addJourney.origin.placeholder")}
              value={values.origin}
              onChange={(place) => form.setFieldValue("origin", place)}
              error={resolveErrorToken(form.errors.origin)}
            />

            <PlaceAutocomplete
              label={t("addJourney.destination.label")}
              placeholder={t("addJourney.destination.placeholder")}
              value={values.destination}
              onChange={(place) => form.setFieldValue("destination", place)}
              error={resolveErrorToken(form.errors.destination)}
            />
          </Stack>

          <button
            type="button"
            className="add-journey__swap"
            aria-label={t("addJourney.swap")}
            onClick={handleSwap}
            disabled={!values.origin && !values.destination}
          >
            <SwapVerticalIcon />
          </button>
        </div>

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
          leftSection={
            selectedTransportIcon ? (
              <img src={selectedTransportIcon} width={TRANSPORT_ICON_SIZE} height={TRANSPORT_ICON_SIZE} alt="" />
            ) : null
          }
          renderOption={({ option }) => (
            <Group gap="xs" wrap="nowrap">
              <img
                src={TRANSPORT_ICONS[option.value as TransportType]}
                width={TRANSPORT_ICON_SIZE}
                height={TRANSPORT_ICON_SIZE}
                alt=""
              />
              <span>{option.label}</span>
            </Group>
          )}
          error={resolveErrorToken(form.errors.transport)}
        />

        <JourneyDateField form={form} />

        {formError && (
          <Text size="sm" fw={500} c="var(--text-error)">
            {resolveErrorToken(formError)}
          </Text>
        )}

        <Button type="submit" size="md" radius="md" fullWidth mt="xs" loading={submitting}>
          {t("addJourney.submit")}
        </Button>
      </Stack>
    </form>
  );
}
