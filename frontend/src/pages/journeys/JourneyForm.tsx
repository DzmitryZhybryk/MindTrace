import { Button, Group, Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { ApiError, applyApiError, errorCodeToken, resolveErrorToken } from "../../api/errors";
import {
  createJourneyMutation,
  getJourneysMapQueryKey,
  zTransportType,
  type PlaceSearchItem,
  type PlaceRef,
  type TransportType,
} from "../../api/sdk";
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
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  transport: TransportType | null;
  year: string | null;
  month: string | null;
  day: string | null;
  hasMonth: boolean;
  hasDay: boolean;
};

const UNKNOWN_PLACE_CODE = "journeys.unknown_place";

/** Место из подсказок → тело запроса: бэк проверяет место по `placeId`. */
function toPlaceRef(place: PlaceSearchItem): PlaceRef {
  // Место без страны выбрать нельзя: подсказки поездки — только города. Пустая строка
  // отсечётся бэком как некорректный ввод, если это когда-нибудь изменится.
  return { placeId: place.placeId, countryCode: place.countryCode ?? "", latitude: place.latitude, longitude: place.longitude };
}

/**
 * Подсвечивает поля с местами, которых бэк не нашёл (`journeys.unknown_place`).
 *
 * Бэк возвращает только id ненайденных мест — какое поле подсветить, форма решает сама,
 * сравнивая их с выбранными местами.
 *
 * Returns:
 *     `true`, если ошибка разобрана и показана у полей.
 */
function applyUnknownPlaceError(
  err: unknown,
  values: JourneyFormValues,
  form: UseFormReturnType<JourneyFormValues>,
): boolean {
  if (!(err instanceof ApiError) || err.code !== UNKNOWN_PLACE_CODE) {
    return false;
  }

  const rawIds = err.details?.place_ids;
  const missing = new Set(Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : []);
  let isApplied = false;
  for (const field of ["origin", "destination"] as const) {
    const place = values[field];
    if (place && missing.has(place.placeId)) {
      form.setFieldError(field, errorCodeToken(UNKNOWN_PLACE_CODE));
      isApplied = true;
    }
  }

  return isApplied;
}

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
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  // Новая поездка меняет агрегат карты — инвалидируем его общий queryKey. Без этого
  // глобус-фон (`staleTime: Infinity`) не увидел бы её до перезагрузки страницы.
  const { mutateAsync: submitJourney, isPending: submitting } = useMutation({
    ...createJourneyMutation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getJourneysMapQueryKey() }),
  });

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
    try {
      await submitJourney({
        body: {
          origin: toPlaceRef(values.origin),
          destination: toPlaceRef(values.destination),
          transportType: values.transport,
          traveledYear: Number(values.year),
          traveledMonth: values.hasMonth && values.month ? Number(values.month) : null,
          traveledDay: values.hasDay && values.day ? Number(values.day) : null,
        },
      });
      navigate("/journeys");
    } catch (err) {
      if (applyUnknownPlaceError(err, values, form)) {
        return;
      }

      // Ошибка операции (не привязана к полю) — на уровне формы, у кнопки сабмита.
      const message = applyApiError(err, form);
      if (message) {
        setFormError(message);
      }
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
          data={zTransportType.options.map((type) => ({ value: type, label: t(`addJourney.transport.${type}`) }))}
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
