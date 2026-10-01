import { RangeSlider, UnstyledButton } from "@mantine/core";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { clamp } from "../../../components/globe/route";
import type { YearWindow } from "./MovementsControls";
import { yearLabelCenters, type ThumbIndex } from "./yearLabelCenters";

// Ручки едут за указателем плавно: шаг — сотая года, а не целый год.
const SMOOTH_STEP = 0.01;
// Высота дорожки; Mantine отступает на неё же по бокам — ручки ездят внутри этих отступов, px.
const TRACK_SIZE = 4;
// Засечки лет не теснее этого: за полвека шкала иначе превращается в бусы, px.
const MIN_TICK_SPACING_PX = 10;
const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100] as const;

const KEYBOARD_YEAR_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};

type SliderPosition = [number, number];

interface YearRangeSliderProps {
  firstYear: number;
  lastYear: number;
  window: YearWindow;
  onWindowChange: (window: YearWindow) => void;
  fromLabel: string;
  toLabel: string;
}

/** Окно лет под ручками: каждая ручка относится к ближайшему году. */
function toWindow([from, to]: SliderPosition): YearWindow {
  return [Math.round(from), Math.round(to)];
}

function isSameWindow(left: YearWindow, right: YearWindow): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

// Год — не длиннее четырёх цифр.
const YEAR_DIGITS = 4;

interface EditableYearProps {
  year: number;
  /** Допустимые годы для этой ручки, включительно: от края шкалы до соседней ручки. */
  min: number;
  max: number;
  label: string;
  onCommit: (year: number) => void;
}

/**
 * Год под ручкой, который можно вписать руками: щелчок превращает его в поле ввода, Enter или
 * уход из поля — применить, Escape — отменить.
 *
 * Год за пределами допустимого встаёт на ближайшую границу: 200 при шкале с 1976 — это 1976.
 * Пустое поле ничего не меняет. Подсказка на поле называет допустимые годы.
 */
function EditableYear({ year, min, max, label, onCommit }: EditableYearProps) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <UnstyledButton className="movements-controls__year" aria-label={label} title={label} onClick={() => setDraft(String(year))}>
        {year}
      </UnstyledButton>
    );
  }

  const commit = () => {
    setDraft(null);
    if (draft !== "") {
      onCommit(clamp(Number.parseInt(draft, 10), min, max));
    }
  };

  return (
    <input
      className="movements-controls__year movements-controls__year-input"
      aria-label={label}
      title={`${min}–${max}`}
      inputMode="numeric"
      maxLength={YEAR_DIGITS}
      value={draft}
      // Поле появляется по щелчку пользователя — фокус в него и есть ожидаемое поведение.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.currentTarget.value.replace(/\D/gu, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(null);
        }
      }}
    />
  );
}

/**
 * Ползунок окна лет: ручки двигаются плавно, а окно — по целым годам.
 *
 * Пока ручку тянут, окно меняется, когда она проходит середину между годами — карта следует
 * сразу. Под каждой ручкой — год, к которому она сейчас ближе; его можно вписать руками, и ручка
 * переедет. Сблизившиеся подписи не наезжают друг на друга (см. yearLabelCenters). Отпущенная
 * ручка мягко доезжает до своего года. Стрелки двигают ручку на целый год, а не на шаг плавного хода.
 */
export function YearRangeSlider({ firstYear, lastYear, window, onWindowChange, fromLabel, toLabel }: YearRangeSliderProps) {
  const [position, setPosition] = useState<SliderPosition>([window[0], window[1]]);
  const [movingThumb, setMovingThumb] = useState<ThumbIndex>(1);
  const [trackedWindow, setTrackedWindow] = useState<YearWindow>(window);
  // Окно сменили снаружи — ручки встают на него; своё же округлённое положение не трогаем.
  if (trackedWindow !== window) {
    setTrackedWindow(window);
    if (!isSameWindow(toWindow(position), window)) {
      setPosition([window[0], window[1]]);
    }
  }

  // Ширина ползунка в пикселях: от неё зависят шаг засечек и места подписей.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    /* v8 ignore next 3 -- обёртка рендерится вместе с ползунком, эффект после монтирования */
    if (!wrapper) {
      return;
    }

    const measure = () => setTrackWidth(wrapper.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const pxPerYear = (trackWidth - 2 * TRACK_SIZE) / (lastYear - firstYear);
  const marks = useMemo(() => {
    const tickStep = TICK_STEPS.find((step) => step * pxPerYear >= MIN_TICK_SPACING_PX) ?? TICK_STEPS.at(-1);
    return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
      .filter((year) => tickStep !== undefined && year % tickStep === 0)
      .map((year) => ({ value: year }));
  }, [firstYear, lastYear, pxPerYear]);

  const changePosition = (next: SliderPosition) => {
    // Двигалась та ручка, чьё значение изменилось: её подпись и уступает при сближении.
    if (next[0] !== position[0]) {
      setMovingThumb(0);
    } else if (next[1] !== position[1]) {
      setMovingThumb(1);
    }

    setPosition(next);
    const nextWindow = toWindow(next);
    if (!isSameWindow(nextWindow, window)) {
      onWindowChange(nextWindow);
    }
  };

  /** Ставит ручку на год: в пределах шкалы и не дальше соседней ручки. */
  const moveThumbTo = (thumbIndex: ThumbIndex, year: number) => {
    const next: SliderPosition = [window[0], window[1]];
    next[thumbIndex] = clamp(year, firstYear, lastYear);
    // Ручки не перескакивают друг через друга: упёршись в соседнюю, ручка встаёт вровень с ней.
    if (next[0] > next[1]) {
      next[thumbIndex] = next[1 - thumbIndex];
    }

    changePosition(next);
  };

  const stepByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const yearStep = KEYBOARD_YEAR_STEPS[event.key];
    const target = event.target;
    if (yearStep === undefined || !(target instanceof HTMLElement) || target.getAttribute("role") !== "slider") {
      return;
    }

    // Перехватываем до Mantine: её шаг — сотая года, со стрелок ползунок еле полз бы.
    event.preventDefault();
    event.stopPropagation();
    const thumbIndex = target.getAttribute("aria-label") === toLabel ? 1 : 0;
    moveThumbTo(thumbIndex, window[thumbIndex] + yearStep);
  };

  const [fromYear, toYear] = toWindow(position);
  // Центр ручки на экране — по той же формуле, что у Mantine: внутри боковых отступов дорожки.
  const thumbX = (value: number) => TRACK_SIZE + (value - firstYear) * pxPerYear;
  const [fromCenter, toCenter] = yearLabelCenters([thumbX(position[0]), thumbX(position[1])], movingThumb, trackWidth);

  return (
    <div ref={wrapperRef} className="movements-controls__slider" onKeyDownCapture={stepByKeyboard}>
      <RangeSlider
        size={TRACK_SIZE}
        color="var(--movement-line)"
        min={firstYear}
        max={lastYear}
        step={SMOOTH_STEP}
        minRange={0}
        value={position}
        onChange={changePosition}
        onChangeEnd={(end) => {
          const snapped = toWindow(end);
          setPosition([snapped[0], snapped[1]]);
        }}
        marks={marks}
        label={null}
        thumbFromLabel={fromLabel}
        thumbToLabel={toLabel}
      />
      {/* Годы под ручками едут вместе с ними; сойдясь, подписи не наезжают друг на друга. */}
      <div className="movements-controls__years">
        <span className="movements-controls__year-group" style={{ left: fromCenter }}>
          <EditableYear year={fromYear} min={firstYear} max={toYear} label={fromLabel} onCommit={(year) => moveThumbTo(0, year)} />
        </span>
        <span className="movements-controls__year-group" style={{ left: toCenter }}>
          <EditableYear year={toYear} min={fromYear} max={lastYear} label={toLabel} onCommit={(year) => moveThumbTo(1, year)} />
        </span>
      </div>
    </div>
  );
}
