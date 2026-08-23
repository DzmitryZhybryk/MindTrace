import { Combobox, Group, InputBase, Loader, ScrollArea, Stack, Text, useCombobox } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { searchPlacesOptions, type PlaceResponse } from "../api/sdk";
import pinIcon from "../assets/emoji/pin.svg";

const PIN_ICON_SIZE = 20;
// Стабильная ссылка на пустую выдачу: эффект «подсветить первую подсказку» завязан на
// идентичность `options` и на новом `[]` каждый рендер гонялся бы вхолостую.
const NO_OPTIONS: PlaceResponse[] = [];

// Префиксный поиск (btree) отрабатывает и на 1 символе, но порог 2 режет флуд запросов.
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;
// Высота списка ограничена — длинная выдача скроллится внутри дропдауна, а не тянет страницу.
const DROPDOWN_MAX_HEIGHT = 320;

interface PlaceAutocompleteProps {
  label: string;
  placeholder: string;
  value: PlaceResponse | null;
  onChange: (place: PlaceResponse | null) => void;
  error?: ReactNode;
}

/**
 * Переводит фокус на следующий контрол формы (поле/селект) после `current`.
 *
 * После выбора места «перекидывает» пользователя на следующий шаг (другой город,
 * транспорт): Enter/Tab по подсказке не должны оставлять курсор в уже заполненном
 * поле. Кнопки (в т.ч. «поменять местами») пропускаем — фокус идёт по полям ввода.
 */
function focusNextFormControl(current: HTMLElement | null): void {
  const form = current?.closest("form");
  if (!current || !form) {
    return;
  }

  const controls = Array.from(
    form.querySelectorAll<HTMLElement>("input:not([type='hidden']), select, textarea"),
  ).filter((element) => !(element as HTMLInputElement).disabled && element.tabIndex !== -1);
  const next = controls[controls.indexOf(current) + 1];
  next?.focus();
}

/**
 * Поле выбора места с автокомплитом по газеттиру (`/v1/geo/places/search`).
 *
 * Набор → debounce → запрос (устаревшие отменяются `AbortController`) → выпадающий
 * список кандидатов; выбор кладёт `PlaceResponse` (с `placeId`) в `value`. Пока место
 * не выбрано, `value` держится `null` (форма требует выбранный кандидат). При пустой
 * выдаче подсказка ведёт пользователя попробовать другое написание/английское имя
 * (страховка от дырявого `name_ru`).
 */
export function PlaceAutocomplete({ label, placeholder, value, onChange, error }: PlaceAutocompleteProps) {
  const { t, i18n } = useTranslation("journeys");
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(value?.name ?? "");
  const [debouncedSearch] = useDebouncedValue(search, DEBOUNCE_MS);
  // Подпись уже выбранного кандидата: пока текст ей равен — повторно не ищем (иначе
  // debounce, «догнав» имя после выбора, тут же запустил бы лишний запрос). Состояние,
  // а не ref: от него зависит `enabled` запроса, то есть значение нужно на рендере.
  const [selectedName, setSelectedName] = useState<string | null>(value?.name ?? null);
  // Последнее значение, которое МЫ САМИ отдали через onChange. Если родитель пришлёт
  // другой `value` (например, swap «Откуда»/«Куда» в форме), значит смена внешняя —
  // и видимый текст надо подтянуть под неё (см. эффект ниже).
  const lastEmittedRef = useRef<PlaceResponse | null>(value);

  // Внешняя установка `value` (swap городов в форме) → синхронизируем видимый текст и
  // «якорь» имени. Свой выбор/правка уже выставили `lastEmittedRef`, поэтому условие
  // гасит лишний прогон и не затирает то, что пользователь печатает.
  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }

    lastEmittedRef.current = value;
    setSelectedName(value?.name ?? null);
    setSearch(value?.name ?? "");
  }, [value]);

  const language = i18n.language.startsWith("ru") ? "ru" : "en";
  // Бэк отдаёт ISO alpha-2 (BY/RU), имя страны резолвит фронт через CLDR под язык UI
  // (контракт проекта — см. docs/architecture.md); неизвестный код → показываем сам код.
  const countryNames = useMemo(() => new Intl.DisplayNames([language], { type: "region", fallback: "none" }), [language]);

  const trimmedSearch = debouncedSearch.trim();
  const isBelowMinLength = trimmedSearch.length < MIN_LENGTH;

  const { data, isFetching, isError } = useQuery({
    ...searchPlacesOptions({ query: { searchText: trimmedSearch, language, limit: RESULT_LIMIT } }),
    enabled: !isBelowMinLength && trimmedSearch !== selectedName,
    // Подсказки предыдущего набора остаются на экране, пока едет следующий запрос:
    // список не схлопывается на каждый введённый символ. Устаревший запрос Query
    // отменяет сам — сигнал уходит в SDK из сгенерированного queryFn.
    placeholderData: keepPreviousData,
  });

  // Короткий текст очищает выдачу, ошибка — тоже (иначе keepPreviousData показывал бы
  // подсказки от запроса, которого пользователь уже не делает).
  const options = useMemo(
    () => (isBelowMinLength || isError ? NO_OPTIONS : (data?.items ?? NO_OPTIONS)),
    [isBelowMinLength, isError, data],
  );

  // Первую подсказку держим активной → Enter сразу выбирает её (без клика/стрелок), и
  // Mantine сам обрабатывает Enter на активной опции, не давая ему отправить форму.
  useEffect(() => {
    if (options.length > 0) {
      combobox.selectFirstOption();
    }
  }, [options, combobox]);

  const handleInputChange = (text: string) => {
    setSearch(text);
    // Редактирование сбрасывает выбранное место: пока не выбран новый кандидат, value пуст.
    setSelectedName(null);
    if (value !== null) {
      lastEmittedRef.current = null;
      onChange(null);
    }

    combobox.openDropdown();
  };

  const handleOptionSubmit = (optionValue: string) => {
    const picked = options.find((place) => place.placeId === optionValue);
    combobox.closeDropdown();
    // optionValue приходит из value рендеренной Combobox.Option → picked всегда найден.
    /* v8 ignore next 3 */
    if (picked === undefined) {
      return;
    }

    setSelectedName(picked.name);
    lastEmittedRef.current = picked;
    onChange(picked);
    setSearch(picked.name);
    // Выбор сделан — уводим фокус на следующее поле (другой город / транспорт), чтобы
    // курсор не «залипал» на уже заполненном поле после Enter/Tab по подсказке.
    focusNextFormControl(inputRef.current);
  };

  const isEmpty = !isBelowMinLength && !isFetching && options.length === 0 && value === null;

  return (
    <Stack gap={6}>
      <Combobox store={combobox} withinPortal onOptionSubmit={handleOptionSubmit}>
        <Combobox.Target>
          <InputBase
            ref={inputRef}
            label={label}
            placeholder={placeholder}
            size="md"
            radius="md"
            value={search}
            onChange={(event) => handleInputChange(event.currentTarget.value)}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            // Tab (как и Enter) применяет первую подсказку. Глушим дефолтный Tab —
            // фокус на следующее поле переводим сами в handleOptionSubmit (иначе он бы
            // уехал дальше/на кнопку обмена). Shift+Tab оставляем браузеру (шаг назад).
            // Через capture, т.к. onKeyDown перехватывает Mantine.
            onKeyDownCapture={(event) => {
              if (event.key === "Tab" && !event.shiftKey && combobox.dropdownOpened && options.length > 0) {
                event.preventDefault();
                handleOptionSubmit(options[0].placeId);
              }
            }}
            rightSection={isFetching ? <Loader size="xs" /> : null}
            rightSectionPointerEvents="none"
            error={error}
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={options.length === 0}>
          <Combobox.Options>
            <ScrollArea.Autosize mah={DROPDOWN_MAX_HEIGHT} type="scroll">
              {options.map((place) => {
                const country = countryNames.of(place.countryCode) ?? place.countryCode;
                return (
                  <Combobox.Option value={place.placeId} key={place.placeId}>
                    <Group gap="xs" wrap="nowrap">
                      <img src={pinIcon} width={PIN_ICON_SIZE} height={PIN_ICON_SIZE} alt="" />
                      <div>
                        <Text size="sm">{place.name}</Text>
                        <Text size="xs" c="var(--text-muted)">
                          {country}
                        </Text>
                      </div>
                    </Group>
                  </Combobox.Option>
                );
              })}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {isEmpty && (
        <Text size="sm" c="var(--text-muted)">
          {t("addJourney.place.hintEmpty")}
        </Text>
      )}
    </Stack>
  );
}
