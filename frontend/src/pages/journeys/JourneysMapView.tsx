import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Loader, Text } from "@mantine/core";

import { getJourneysMap, type MapCountryResponse } from "../../api/sdk";
import type { MapCountry } from "../../components/WorldMap";
import { WorldMap } from "../../components/WorldMap";
import { JourneysLegendCard } from "./JourneysLegendCard";
import { MAP_TONE } from "./journeys-data";

type MapLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; countries: MapCountry[] };

/**
 * Переводит агрегат карты в модель `WorldMap`.
 *
 * Эндпоинт по смыслу отдаёт только посещённые страны (wishlist — отдельный запрос), поэтому
 * статус проставляем здесь. Имя страны фронт резолвит из кода сам, бэк его не шлёт.
 */
function toMapCountries(countries: readonly MapCountryResponse[]): MapCountry[] {
  return countries.map((country) => ({
    id: country.countryCode,
    status: "visited",
    cities: country.cities.map((city) => ({
      name: city.name,
      lat: city.latitude,
      lng: city.longitude,
      years: city.years,
    })),
  }));
}

/**
 * Под-вкладка «Карта путешествий» — индексный маршрут /journeys. Тянет агрегат поездок
 * пользователя с бэка и раскрашивает карту мира; пустой набор → карта серая (поездок нет).
 * Загрузка/ошибка показываются оверлеем поверх карты — сама карта рендерится сразу.
 */
export function JourneysMapView() {
  const { t } = useTranslation("journeys");
  const [state, setState] = useState<MapLoadState>({ status: "loading" });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getJourneysMap({ signal: controller.signal, throwOnError: true })
      .then((response) => {
        setState({ status: "ready", countries: toMapCountries(response.countries) });
      })
      .catch((error: unknown) => {
        // Прерванный запрос (размонтирование/перезагрузка) — не ошибка; тестировать нечего.
        /* v8 ignore next 3 */
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({ status: "error" });
      });
    return controller;
  }, []);

  useEffect(() => {
    const controller = load();
    return () => {
      controller.abort();
    };
  }, [load]);

  const countries = state.status === "ready" ? state.countries : [];

  return (
    <>
      <WorldMap className="journeys-map" countries={countries} tone={MAP_TONE} />
      {state.status === "loading" && (
        <output className="journeys-map-status">
          <Loader size="sm" color="gray" />
          <Text size="sm" c="var(--text-muted)">
            {t("map.loading")}
          </Text>
        </output>
      )}
      {state.status === "error" && (
        <div className="journeys-map-status" role="alert">
          <Text size="sm" fw={500} c="var(--text-error)">
            {t("map.error")}
          </Text>
          <Button size="xs" variant="subtle" color="gray" onClick={() => load()}>
            {t("map.retry")}
          </Button>
        </div>
      )}
      <JourneysLegendCard />
    </>
  );
}
