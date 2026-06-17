import { Combobox, Group, InputBase, Loader, ScrollArea, Stack, Text, useCombobox } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { searchCities, type CitySuggestion } from "../api/journeys";
import pinIcon from "../assets/emoji/pin.svg";

// Размер эмодзи-пина в строке подсказки города (px).
const PIN_ICON_SIZE = 20;

// Префиксный поиск (btree) отрабатывает и на 1 символе, но порог 2 режет флуд запросов.
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;
// Высота списка ограничена — длинная выдача скроллится внутри дропдауна, а не тянет страницу.
const DROPDOWN_MAX_HEIGHT = 320;

interface CityAutocompleteProps {
  label: string;
  placeholder: string;
  value: CitySuggestion | null;
  onChange: (city: CitySuggestion | null) => void;
  error?: ReactNode;
}

/**
 * Поле выбора города с автокомплитом по газеттиру GeoNames (`/v1/geo/cities/search`).
 *
 * Набор → debounce → запрос (устаревшие отменяются `AbortController`) → выпадающий
 * список кандидатов; выбор кладёт реальный `CitySuggestion` с `geonameId` в `value`.
 * Пока город не выбран, `value` держится `null` (форма требует выбранный кандидат).
 * При пустой выдаче подсказка ведёт пользователя попробовать другое написание/английское
 * имя (страховка от дырявого `name_ru`).
 */
export function CityAutocomplete({ label, placeholder, value, onChange, error }: CityAutocompleteProps) {
  const { t, i18n } = useTranslation("journeys");
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  const [search, setSearch] = useState(value?.name ?? "");
  const [options, setOptions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedSearch] = useDebouncedValue(search, DEBOUNCE_MS);
  // Подпись уже выбранного кандидата: пока текст ей равен — повторно не ищем (иначе
  // debounce, «догнав» имя после выбора, тут же запустил бы лишний запрос).
  const selectedNameRef = useRef<string | null>(value?.name ?? null);

  const language = i18n.language.startsWith("ru") ? "ru" : "en";
  // Бэк отдаёт ISO alpha-2 (BY/RU), имя страны резолвит фронт через CLDR под язык UI
  // (контракт проекта — см. docs/architecture.md); неизвестный код → показываем сам код.
  const countryNames = useMemo(() => new Intl.DisplayNames([language], { type: "region", fallback: "none" }), [language]);

  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    if (trimmed === selectedNameRef.current) {
      return;
    }

    if (trimmed.length < MIN_LENGTH) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    searchCities({ searchText: trimmed, language, limit: RESULT_LIMIT, signal: controller.signal })
      .then((cities) => {
        setOptions(cities);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Устаревший запрос отменён следующим набором — игнорируем, не трогаем стейт.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setOptions([]);
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, language]);

  // Первую подсказку держим активной → Enter сразу выбирает её (без клика/стрелок), и
  // Mantine сам обрабатывает Enter на активной опции, не давая ему отправить форму.
  useEffect(() => {
    if (options.length > 0) {
      combobox.selectFirstOption();
    }
  }, [options, combobox]);

  const handleInputChange = (text: string) => {
    setSearch(text);
    // Редактирование сбрасывает выбранный город: пока не выбран новый кандидат, value пуст.
    selectedNameRef.current = null;
    if (value !== null) {
      onChange(null);
    }

    combobox.openDropdown();
  };

  const handleOptionSubmit = (optionValue: string) => {
    const picked = options.find((city) => String(city.geonameId) === optionValue);
    if (picked !== undefined) {
      selectedNameRef.current = picked.name;
      onChange(picked);
      setSearch(picked.name);
    }

    combobox.closeDropdown();
  };

  const hasQuery = debouncedSearch.trim().length >= MIN_LENGTH;
  const isEmpty = hasQuery && !loading && options.length === 0 && value === null;

  return (
    <Stack gap={6}>
      <Combobox store={combobox} withinPortal onOptionSubmit={handleOptionSubmit}>
        <Combobox.Target>
          <InputBase
            label={label}
            placeholder={placeholder}
            size="md"
            radius="md"
            value={search}
            onChange={(event) => handleInputChange(event.currentTarget.value)}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            // Tab (как и Enter) применяет первую подсказку; без preventDefault фокус
            // уходит на следующее поле. Через capture, т.к. onKeyDown перехватывает Mantine.
            onKeyDownCapture={(event) => {
              if (event.key === "Tab" && combobox.dropdownOpened && options.length > 0) {
                handleOptionSubmit(String(options[0].geonameId));
              }
            }}
            rightSection={loading ? <Loader size="xs" /> : null}
            rightSectionPointerEvents="none"
            error={error}
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={options.length === 0}>
          <Combobox.Options>
            <ScrollArea.Autosize mah={DROPDOWN_MAX_HEIGHT} type="scroll">
              {options.map((city) => {
                const country = countryNames.of(city.countryCode) ?? city.countryCode;
                return (
                  <Combobox.Option value={String(city.geonameId)} key={city.geonameId}>
                    <Group gap="xs" wrap="nowrap">
                      <img src={pinIcon} width={PIN_ICON_SIZE} height={PIN_ICON_SIZE} alt="" />
                      <div>
                        <Text size="sm">{city.name}</Text>
                        <Text size="xs" c="dimmed">
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
        <Text size="sm" c="dimmed">
          {t("addJourney.city.hintEmpty")}
        </Text>
      )}
    </Stack>
  );
}
