import type { FormValidateInput, UseFormReturnType } from "@mantine/form";

import { ApiError, errorCodeToken } from "../../api/errors";
import type { PlaceRef, PlaceSearchItem, TransportType } from "../../api/sdk";

/** Поля поездки — общие для добавления и правки. */
export type JourneyFormValues = {
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  transport: TransportType | null;
  year: string | null;
};

const UNKNOWN_PLACE_CODE = "journeys.unknown_place";

type PlaceWithCountry = PlaceSearchItem & { countryCode: string };

/**
 * Валидаторы полей поездки.
 *
 * Возвращают i18n-ТОКЕН (`journeys:addJourney.validation.*`), а не готовый текст: резолв в строку —
 * при рендере (`resolveErrorToken`), чтобы ошибка переключалась на новый язык вместе с интерфейсом.
 */
export const JOURNEY_FORM_VALIDATE: FormValidateInput<JourneyFormValues> = {
  origin: (value) => {
    if (!value) {
      return "journeys:addJourney.validation.originRequired";
    }
    // Поездка хранит страну места; справочник допускает места без неё (моря, океаны).
    return value.countryCode ? null : "journeys:addJourney.validation.placeWithoutCountry";
  },
  destination: (value, values) => {
    if (!value) {
      return "journeys:addJourney.validation.destinationRequired";
    }
    if (!value.countryCode) {
      return "journeys:addJourney.validation.placeWithoutCountry";
    }
    // Тот же город отсекаем ещё на фронте; бэк проверит то же самое по placeId.
    if (values.origin && values.origin.placeId === value.placeId) {
      return "journeys:addJourney.validation.sameCity";
    }
    return null;
  },
  transport: (value) => (value ? null : "journeys:addJourney.validation.transportRequired"),
  year: (value) => (value ? null : "journeys:addJourney.validation.yearRequired"),
};

/** Поездке нужна страна места; место без неё валидатор формы не пропускает до сабмита. */
export function hasCountry(place: PlaceSearchItem): place is PlaceWithCountry {
  return Boolean(place.countryCode);
}

/** Место из подсказок → тело запроса: бэк проверяет место по `placeId`. */
export function toPlaceRef(place: PlaceWithCountry): PlaceRef {
  return { placeId: place.placeId, countryCode: place.countryCode, latitude: place.latitude, longitude: place.longitude };
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
export function applyUnknownPlaceError(
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
