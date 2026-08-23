import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Loader, Text } from "@mantine/core";

import { getJourneysMapOptions, type JourneysMapResponse } from "../../api/sdk";
import type { MapCountry } from "../../components/WorldMap";
import { WorldMap } from "../../components/WorldMap";
import { JourneysLegendCard } from "./JourneysLegendCard";
import { MAP_TONE } from "./journeys-data";

// Стабильная ссылка на «стран нет»: `WorldMap` пересчитывает раскраску по идентичности пропа.
const NO_COUNTRIES: MapCountry[] = [];

/**
 * Переводит агрегат карты в модель `WorldMap`.
 *
 * Эндпоинт по смыслу отдаёт только посещённые страны (wishlist — отдельный запрос), поэтому
 * статус проставляем здесь. Имя страны фронт резолвит из кода сам, бэк его не шлёт.
 *
 * Модульная (а не инлайн-стрелка) — Query мемоизирует результат `select` по ссылке на функцию.
 */
function toMapCountries(response: JourneysMapResponse): MapCountry[] {
  return response.countries.map((country) => ({
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
  // `staleTime: 0` — своя свежесть поверх общего с глобусом-фоном queryKey: вкладку карты
  // открывают, чтобы увидеть актуальные поездки, поэтому на каждый маунт идём за данными.
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    ...getJourneysMapOptions(),
    staleTime: 0,
    select: toMapCountries,
  });

  return (
    <>
      <WorldMap className="journeys-map" countries={data ?? NO_COUNTRIES} tone={MAP_TONE} />
      {isPending && (
        <output className="journeys-map-status">
          <Loader size="sm" color="gray" />
          <Text size="sm" c="var(--text-muted)">
            {t("map.loading")}
          </Text>
        </output>
      )}
      {isError && (
        <div className="journeys-map-status" role="alert">
          <Text size="sm" fw={500} c="var(--text-error)">
            {t("map.error")}
          </Text>
          {/* Алерт остаётся на экране на время повтора — спиннер живёт в самой кнопке,
              иначе управление пропадало бы вместе с сообщением. */}
          <Button size="xs" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
            {t("map.retry")}
          </Button>
        </div>
      )}
      <JourneysLegendCard />
    </>
  );
}
