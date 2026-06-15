import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";

import type { CitySuggestion } from "../api/journeys";

interface CityAutocompleteProps {
  label: string;
  placeholder: string;
  value: CitySuggestion | null;
  onChange: (city: CitySuggestion | null) => void;
  error?: ReactNode;
  description?: ReactNode;
}

/**
 * Временно: до автокомплита поле — свободный текст. Из ввода собираем провизорный
 * `CitySuggestion` с sentinel `geonameId=0` («ещё не реальный город»), чтобы контракт
 * пропсов остался финальным. Следующий шаг заменит это поиском по `/v1/geo/cities/search`.
 */
function provisionalCity(name: string): CitySuggestion {
  return { geonameId: 0, name, countryCode: "", latitude: 0, longitude: 0, population: 0 };
}

/**
 * Поле выбора города с автокомплитом по газеттиру GeoNames.
 *
 * ТЕКУЩИЙ ШАГ: активный свободный ввод (без поиска и подсказок) — реальный
 * автокомплит (debounce-запрос к `/v1/geo/cities/search`, выпадающий список
 * кандидатов, выбор → `geonameId`) добавляется следующим шагом. Контракт пропсов
 * финальный (`value`/`onChange` работают с `CitySuggestion`), чтобы наполнение не
 * затрагивало JourneyForm.
 */
export function CityAutocomplete({ label, placeholder, value, onChange, error, description }: CityAutocompleteProps) {
  return (
    <TextInput
      label={label}
      placeholder={placeholder}
      description={description}
      size="md"
      radius="md"
      value={value?.name ?? ""}
      onChange={(event) => {
        const text = event.currentTarget.value;
        onChange(text.length > 0 ? provisionalCity(text) : null);
      }}
      error={error}
    />
  );
}
