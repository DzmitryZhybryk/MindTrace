import { Button, Group, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, applyApiError, errorCodeToken, resolveErrorToken } from "../../../api/errors";
import { placeLabel, type PlaceNameLookup } from "../../../api/placeNames";
import {
  deleteJourneyMutation,
  updateJourneyMutation,
  type JourneyFeedEntry,
  type JourneyPlace,
  type PlaceSearchItem,
} from "../../../api/sdk";
import { PlaceAutocomplete } from "../../../components/PlaceAutocomplete";
import { invalidateJourneyAggregates, invalidateJourneyFeed, removeJourneyFromFeed } from "../journeyCache";
import {
  JOURNEY_FORM_VALIDATE,
  applyUnknownPlaceError,
  hasCountry,
  toPlaceRef,
  type JourneyFormValues,
} from "../journeyFormRules";
import { JourneyYearField } from "../JourneyYearField";
import { TransportPicker } from "../TransportPicker";
import { prefersReducedMotion } from "./motion";

const JOURNEY_NOT_FOUND_CODE = "journeys.journey_not_found";

/** Поле строки, по которому кликнули, — в нём окажется фокус при открытии правки. */
export type JourneyEditField = "origin" | "destination" | "transport" | "year";

interface JourneyRowEditorProps {
  journey: JourneyFeedEntry;
  nameOf: PlaceNameLookup;
  focusField: JourneyEditField;
  onClose: () => void;
  /** Поездка сохранена — строка после закрытия правки мигнёт подсветкой. */
  onSaved: () => void;
}

function isJourneyNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.code === JOURNEY_NOT_FOUND_CODE;
}

/**
 * Показан ли у поля выпадающий список с вариантами.
 *
 * Mantine помечает открытый список `data-expanded` (а `aria-expanded` — не у всех полей), но
 * подсказки места «открываются» и пустыми, по фокусу. Поэтому список считается показанным, только
 * если в нём есть варианты.
 */
function isListShown(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.dataset.expanded === undefined) {
    return false;
  }

  const listId = target.getAttribute("aria-controls");
  return Boolean(listId && document.getElementById(listId)?.querySelector('[role="option"]'));
}

/**
 * Правка строки ленты на месте: все поля поездки разом, Save / Cancel / Esc, плюс удаление с
 * подтверждением в самой строке.
 *
 * Сохранение отправляет все поля целиком. Одинаковые города выбрать можно — сохранить нельзя,
 * это ловит валидатор формы. Удалённая в другом месте поездка: на сохранении — ошибка и
 * обновлённая лента, на удалении — просто убираем строку, цель уже достигнута.
 */
export function JourneyRowEditor({ journey, nameOf, focusField, onClose, onSaved }: JourneyRowEditorProps) {
  const { t } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLFormElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  // Удалённая строка сначала схлопывается и только потом пропадает из ленты.
  const [isCollapsing, setIsCollapsing] = useState(false);

  const unknownLabel = tCommon("map.unknownPlace");
  const toSearchItem = (place: JourneyPlace): PlaceSearchItem => ({
    ...place,
    name: placeLabel(nameOf(place.placeId), unknownLabel) ?? "",
    population: null,
  });

  const form = useForm<JourneyFormValues>({
    mode: "controlled",
    initialValues: {
      origin: toSearchItem(journey.origin),
      destination: toSearchItem(journey.destination),
      transport: journey.transportType,
      year: String(journey.traveledYear),
    },
    validate: JOURNEY_FORM_VALIDATE,
  });

  useEffect(() => {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-edit-field="${focusField}"] input:not([type="hidden"])`)
      ?.focus();
  }, [focusField]);

  // Esc внутри правки отменяет её. Пока у поля показан список (подсказки места, годы), Esc
  // закрывает только список. Слушатель нативный: React-обработчики Mantine сработают позже,
  // поэтому смотрим на сам список, а не на `defaultPrevented`.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isListShown(event.target)) {
        onClose();
      }
    };
    root.addEventListener("keydown", handleKeyDown);

    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const { mutateAsync: saveJourney, isPending: isSaving } = useMutation({
    ...updateJourneyMutation(),
    onSuccess: () => Promise.all([invalidateJourneyAggregates(queryClient), invalidateJourneyFeed(queryClient)]),
  });
  const { mutateAsync: removeJourney, isPending: isDeleting } = useMutation(deleteJourneyMutation());

  const handleSubmit = async (values: JourneyFormValues) => {
    const { origin, destination } = values;
    if (!origin || !destination || !hasCountry(origin) || !hasCountry(destination) || !values.transport || !values.year) {
      return;
    }

    setFormError(null);
    try {
      await saveJourney({
        path: { journey_id: journey.journeyId },
        body: {
          origin: toPlaceRef(origin),
          destination: toPlaceRef(destination),
          transportType: values.transport,
          traveledYear: Number(values.year),
        },
      });
      onSaved();
      onClose();
    } catch (err) {
      if (isJourneyNotFound(err)) {
        setFormError(errorCodeToken(JOURNEY_NOT_FOUND_CODE));
        void invalidateJourneyFeed(queryClient);
        return;
      }

      if (applyUnknownPlaceError(err, values, form)) {
        return;
      }

      const message = applyApiError(err, form);
      if (message) {
        setFormError(message);
      }
    }
  };

  const handleDelete = async () => {
    setFormError(null);
    try {
      await removeJourney({ path: { journey_id: journey.journeyId } });
    } catch (err) {
      if (!isJourneyNotFound(err)) {
        setFormError(applyApiError(err, form));
        return;
      }
    }

    if (prefersReducedMotion()) {
      finishDelete();
    } else {
      setIsCollapsing(true);
    }
  };

  const finishDelete = () => {
    removeJourneyFromFeed(queryClient, journey.journeyId);
    void invalidateJourneyAggregates(queryClient);
    onClose();
  };

  const values = form.getValues();

  return (
    <li
      className={isCollapsing ? "journey-row journey-row--editing journey-row--collapsing" : "journey-row journey-row--editing"}
      data-flip-id={journey.journeyId}
      onAnimationEnd={(event) => {
        if (event.animationName === "journey-row-collapse") {
          finishDelete();
        }
      }}
    >
      <form ref={rootRef} className="journey-editor" onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <div className="journey-editor__route">
            <div data-edit-field="origin">
              <PlaceAutocomplete
                label={t("addJourney.origin.label")}
                placeholder={t("addJourney.origin.placeholder")}
                value={values.origin}
                onChange={(place) => form.setFieldValue("origin", place)}
                error={resolveErrorToken(form.errors.origin)}
              />
            </div>
            <div data-edit-field="destination">
              <PlaceAutocomplete
                label={t("addJourney.destination.label")}
                placeholder={t("addJourney.destination.placeholder")}
                value={values.destination}
                onChange={(place) => form.setFieldValue("destination", place)}
                error={resolveErrorToken(form.errors.destination)}
              />
            </div>
          </div>

          <div data-edit-field="transport">
            <TransportPicker
              value={values.transport}
              onChange={(transport) => {
                form.setFieldValue("transport", transport);
                form.clearFieldError("transport");
              }}
              error={resolveErrorToken(form.errors.transport)}
            />
          </div>

          <div data-edit-field="year">
            <JourneyYearField form={form} />
          </div>

          {formError && (
            <Text size="sm" fw={500} c="var(--text-error)">
              {resolveErrorToken(formError)}
            </Text>
          )}

          {isConfirmingDelete ? (
            <Group gap="xs" className="journey-editor__actions">
              <Text size="sm" fw={500}>
                {t("all.deleteConfirm")}
              </Text>
              <Button size="xs" color="red" loading={isDeleting} onClick={() => void handleDelete()}>
                {t("all.deleteYes")}
              </Button>
              <Button size="xs" variant="subtle" color="gray" disabled={isDeleting} onClick={() => setIsConfirmingDelete(false)}>
                {t("all.deleteNo")}
              </Button>
            </Group>
          ) : (
            <Group gap="xs" className="journey-editor__actions">
              <Button type="submit" size="xs" loading={isSaving}>
                {t("all.save")}
              </Button>
              <Button size="xs" variant="subtle" color="gray" disabled={isSaving} onClick={onClose}>
                {t("all.cancel")}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                className="journey-editor__delete"
                disabled={isSaving}
                onClick={() => setIsConfirmingDelete(true)}
              >
                {t("all.delete")}
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </li>
  );
}
