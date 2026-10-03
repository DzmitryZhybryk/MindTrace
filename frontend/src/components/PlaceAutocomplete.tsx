import { Combobox, Group, InputBase, Loader, ScrollArea, Stack, Text, useCombobox } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { searchPlacesOptions, type PlaceSearchItem } from "../api/sdk";
import pinIcon from "../assets/emoji/pin.svg";
import { toApiLanguage } from "../i18n/apiLanguage";
import "./place-autocomplete.css";

const PIN_ICON_SIZE = 20;
// Stable reference for empty results: the "highlight the first option" effect depends on
// `options` identity and would rerun every render with a fresh `[]`.
const NO_OPTIONS: PlaceSearchItem[] = [];

// The backend accepts queries from 2 characters.
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;
// Capped height: a long list scrolls inside the dropdown instead of stretching the page.
const DROPDOWN_MAX_HEIGHT = 320;

interface PlaceAutocompleteProps {
  label: string;
  placeholder: string;
  value: PlaceSearchItem | null;
  onChange: (place: PlaceSearchItem | null) => void;
  error?: ReactNode;
}

/**
 * Moves focus to the next form control (input/select) after `current`.
 *
 * After a place is picked, Enter/Tab must not leave the cursor in the filled field. Buttons
 * (including swap) are skipped: focus follows input fields only.
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
 * Place picker with gazetteer autocomplete (`/v1/geo/places/search`).
 *
 * Typing -> debounce -> request (stale ones are aborted) -> dropdown of candidates; picking puts
 * a `PlaceSearchItem` (with `placeId`) into `value`. `value` stays `null` until a candidate is
 * picked (the form requires one). On empty results a hint suggests another spelling or the
 * English name (insurance against gaps in `name_ru`).
 */
export function PlaceAutocomplete({ label, placeholder, value, onChange, error }: PlaceAutocompleteProps) {
  const { t, i18n } = useTranslation("journeys");
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(value?.name ?? "");
  const [debouncedSearch] = useDebouncedValue(search, DEBOUNCE_MS);
  // Name of the already picked candidate: while the text equals it, do not search again (the
  // debounce catching up after a pick would fire a needless request). State, not a ref: the
  // query's `enabled` depends on it, so it is needed during render.
  const [selectedName, setSelectedName] = useState<string | null>(value?.name ?? null);
  // Last value WE emitted via onChange. If the parent sends a different `value` (e.g. a
  // from/to swap), the change is external and the visible text must follow (see the effect below).
  const lastEmittedRef = useRef<PlaceSearchItem | null>(value);

  // An external `value` change (city swap) syncs the visible text and the name anchor. Our own
  // pick/edit already set `lastEmittedRef`, so the condition skips a needless run and does not
  // overwrite what the user is typing.
  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }

    lastEmittedRef.current = value;
    setSelectedName(value?.name ?? null);
    setSearch(value?.name ?? "");
  }, [value]);

  const language = toApiLanguage(i18n.language);
  // The backend returns ISO alpha-2 (BY/RU); the frontend resolves the country name via CLDR for
  // the UI language (see docs/architecture.md). Unknown code: show the code itself.
  const countryNames = useMemo(() => new Intl.DisplayNames([language], { type: "region", fallback: "none" }), [language]);

  const trimmedSearch = debouncedSearch.trim();
  const isBelowMinLength = trimmedSearch.length < MIN_LENGTH;

  const { data, isFetching, isError } = useQuery({
    ...searchPlacesOptions({ query: { searchText: trimmedSearch, language, limit: RESULT_LIMIT } }),
    enabled: !isBelowMinLength && trimmedSearch !== selectedName,
    // Previous suggestions stay on screen while the next request is in flight, so the list does
    // not collapse on every keystroke. Query aborts the stale request itself (the signal goes
    // to the SDK from the generated queryFn).
    placeholderData: keepPreviousData,
  });

  // Short text clears the results, and so does an error (otherwise keepPreviousData would show
  // suggestions from a query the user no longer makes).
  const options = useMemo(
    () => (isBelowMinLength || isError ? NO_OPTIONS : (data?.items ?? NO_OPTIONS)),
    [isBelowMinLength, isError, data],
  );

  // Keep the first option active so Enter picks it without a click or arrows, and Mantine
  // handles Enter on the active option instead of letting it submit the form.
  useEffect(() => {
    if (options.length > 0) {
      combobox.selectFirstOption();
    }
  }, [options, combobox]);

  const handleInputChange = (text: string) => {
    setSearch(text);
    // Editing clears the picked place: value stays empty until a new candidate is picked.
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
    // optionValue comes from a rendered Combobox.Option's value, so `picked` is always found.
    /* v8 ignore next 3 */
    if (picked === undefined) {
      return;
    }

    setSelectedName(picked.name);
    lastEmittedRef.current = picked;
    onChange(picked);
    setSearch(picked.name);
    // Picked: move focus to the next field (other city / transport) so the cursor does not stick
    // in the filled field after Enter/Tab on a suggestion.
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
            // Tab (like Enter) applies the first suggestion. Suppress default Tab: handleOptionSubmit
            // moves focus itself (otherwise it would jump on or to the swap button). Shift+Tab is
            // left to the browser (step back). Uses capture because Mantine intercepts onKeyDown.
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
                // Places like seas have no country: show no country label.
                const country = place.countryCode ? (countryNames.of(place.countryCode) ?? place.countryCode) : null;
                return (
                  <Combobox.Option className="place-option" value={place.placeId} key={place.placeId}>
                    <Group gap="xs" wrap="nowrap">
                      <img src={pinIcon} width={PIN_ICON_SIZE} height={PIN_ICON_SIZE} alt="" />
                      <div>
                        <Text size="sm">{place.name}</Text>
                        {country && (
                          <Text size="xs" className="place-option__country">
                            {country}
                          </Text>
                        )}
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
