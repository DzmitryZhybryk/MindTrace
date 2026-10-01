import { Chip, Group, Text, UnstyledButton, VisuallyHidden } from "@mantine/core";
import { useRef, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { zTransportType, type TransportType } from "../../../api/sdk";
import { TRANSPORT_ICONS } from "../../../components/transportIcons";
import { useDraggableCard } from "./useDraggableCard";
import { YearRangeSlider } from "./YearRangeSlider";

/** Окно лет `[с, по]`, обе границы включительно. */
export type YearWindow = readonly [number, number];

const TRANSPORT_ICON_SIZE = 20;

interface MovementsControlsProps {
  firstYear: number;
  lastYear: number;
  window: YearWindow;
  /** Граница окна перешла на другой год — карта меняется прямо по ходу перетаскивания. */
  onWindowChange: (window: YearWindow) => void;
  transportTypes: readonly TransportType[];
  onTransportTypesChange: (transportTypes: TransportType[]) => void;
  /** Панель навигации: карточка не наезжает на неё и выравнивается по её краям. */
  panelRef: RefObject<HTMLElement | null>;
}

/** Ручка перетаскивания — два ряда точек; UI-контрол, рисуется по `currentColor`. */
function GripIcon() {
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" fill="currentColor">
      {[2, 8, 14].map((x) => [2, 6].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
    </svg>
  );
}

/**
 * Фильтры карты перемещений: окно лет и виды транспорта, в перетаскиваемой карточке.
 *
 * Линии появляются и исчезают прямо по ходу перетаскивания ползунка (см. YearRangeSlider).
 * Карточку двигают за ушко над верхним краем (стрелками — тоже), двойной клик по ушку
 * возвращает её в угол по умолчанию.
 */
export function MovementsControls({
  firstYear,
  lastYear,
  window,
  onWindowChange,
  transportTypes,
  onTransportTypesChange,
  panelRef,
}: MovementsControlsProps) {
  const { t } = useTranslation("journeys");
  const cardRef = useRef<HTMLElement>(null);
  const { style, handleProps } = useDraggableCard(cardRef, panelRef);

  const isSingleYear = firstYear === lastYear;
  const hasTransport = transportTypes.length > 0;

  return (
    <section ref={cardRef} className="movements-controls journeys-card" style={style} aria-label={t("movements.controls")}>
      <UnstyledButton
        className="movements-controls__handle"
        aria-label={t("movements.move")}
        title={t("movements.move")}
        {...handleProps}
      >
        <GripIcon />
      </UnstyledButton>

      {/* Одного года хватает подписи — двигать в ползунке нечего. */}
      {isSingleYear ? (
        <Text className="movements-controls__single-year">{firstYear}</Text>
      ) : (
        <YearRangeSlider
          firstYear={firstYear}
          lastYear={lastYear}
          window={window}
          onWindowChange={onWindowChange}
          fromLabel={t("movements.yearFrom")}
          toLabel={t("movements.yearTo")}
        />
      )}

      <Chip.Group multiple value={[...transportTypes]} onChange={(value) => onTransportTypesChange(value as TransportType[])}>
        <fieldset className="movements-controls__transport">
          <VisuallyHidden component="legend">{t("movements.transport")}</VisuallyHidden>
          {/* Одни иконки в ряд, поровну; подпись — для скринридера и во всплывающей подсказке.
              Выбранность видна по заливке, без галочки. */}
          <Group gap={6} grow wrap="nowrap">
            {zTransportType.options.map((type) => (
              <Chip
                key={type}
                value={type}
                variant="outline"
                size="md"
                className="movements-controls__chip"
                title={t(`addJourney.transport.${type}`)}
              >
                <img
                  className={`movements-controls__icon movements-controls__icon--${type}`}
                  src={TRANSPORT_ICONS[type]}
                  width={TRANSPORT_ICON_SIZE}
                  height={TRANSPORT_ICON_SIZE}
                  alt=""
                />
                <VisuallyHidden>{t(`addJourney.transport.${type}`)}</VisuallyHidden>
              </Chip>
            ))}
          </Group>
        </fieldset>
      </Chip.Group>

      {!hasTransport && (
        <Text size="sm" c="var(--text-muted)">
          {t("movements.noTransport")}
        </Text>
      )}
    </section>
  );
}
