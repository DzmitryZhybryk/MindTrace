import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { placeLabel, type PlaceNameLookup } from "../../../api/placeNames";
import type { JourneyFeedEntry } from "../../../api/sdk";
import { TRANSPORT_ICONS } from "../../../components/transportIcons";
import type { JourneyEditField } from "./JourneyRowEditor";
import { useAnimatedNumber } from "./motion";

const TRANSPORT_ICON_SIZE = 22;

interface JourneyFeedRowProps {
  journey: JourneyFeedEntry;
  nameOf: PlaceNameLookup;
  distanceFormat: Intl.NumberFormat;
  /** Клик по полю строки открывает правку с фокусом в этом поле. */
  onEdit: (field: JourneyEditField) => void;
  isDragDisabled: boolean;
  /** Год, в который попадёт строка, если её сейчас бросить; задан только у перетаскиваемой. */
  dropYear: number | null;
  /** Строку только что сохранили — она мигнёт подсветкой, после чего вызовет `onSavedShown`. */
  isSaved: boolean;
  onSavedShown: () => void;
}

/** Ручка перетаскивания — два столбца точек; UI-контрол, рисуется по `currentColor`. */
function GripIcon() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true" fill="currentColor">
      {[2, 6].map((x) => [2, 7, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
    </svg>
  );
}

/**
 * Строка ленты: ручка, транспорт, «откуда → куда» и расстояние. Пока названия грузятся — многоточие.
 *
 * Транспорт и места — кнопки без рамки: нажатие открывает правку строки. Расстояние считает бэк,
 * поэтому оно не нажимается. Строку тянут за ручку — мышью, пальцем или с клавиатуры (пробел,
 * стрелки, пробел); при переносе в другой год рядом показывается «→ год».
 */
export function JourneyFeedRow({
  journey,
  nameOf,
  distanceFormat,
  onEdit,
  isDragDisabled,
  dropYear,
  isSaved,
  onSavedShown,
}: JourneyFeedRowProps) {
  const { t } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: journey.journeyId,
    disabled: isDragDisabled,
  });

  const unknownLabel = tCommon("map.unknownPlace");
  const origin = placeLabel(nameOf(journey.origin.placeId), unknownLabel);
  const destination = placeLabel(nameOf(journey.destination.placeId), unknownLabel);
  const transportLabel = t(`addJourney.transport.${journey.transportType}`);
  const isChangingYear = isDragging && dropYear !== null && dropYear !== journey.traveledYear;
  const distanceKm = useAnimatedNumber(journey.distanceKm);
  const className = ["journey-row", isDragging && "journey-row--dragging", isSaved && "journey-row--saved"]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-flip-id={journey.journeyId}
      onAnimationEnd={(event) => {
        if (isSaved && event.animationName === "journey-row-saved") {
          onSavedShown();
        }
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="journey-row__handle"
        aria-label={t("all.dragHandle")}
        disabled={isDragDisabled}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <button type="button" className="journey-row__field" title={transportLabel} onClick={() => onEdit("transport")}>
        <img
          src={TRANSPORT_ICONS[journey.transportType]}
          width={TRANSPORT_ICON_SIZE}
          height={TRANSPORT_ICON_SIZE}
          alt={transportLabel}
        />
      </button>
      <span className="journey-row__route">
        <button type="button" className="journey-row__field journey-row__place" onClick={() => onEdit("origin")}>
          {origin ?? "…"}
        </button>
        <span className="journey-row__arrow" aria-hidden="true">
          →
        </span>
        <VisuallyHidden>{` ${t("all.routeTo")} `}</VisuallyHidden>
        <button type="button" className="journey-row__field journey-row__place" onClick={() => onEdit("destination")}>
          {destination ?? "…"}
        </button>
      </span>
      {/* Ключ — год: при переходе в следующий год подсказка перелистывается заново. */}
      {isChangingYear ? (
        <span key={dropYear} className="journey-row__drop-year">
          → {dropYear}
        </span>
      ) : (
        <span className="journey-row__distance">{distanceFormat.format(distanceKm)}</span>
      )}
    </li>
  );
}
