import { useTranslation } from "react-i18next";

/** Условие лицензии CC BY 4.0: там, где показаны названия мест из GeoNames, указываем источник. */
export function GeoNamesAttribution() {
  const { t } = useTranslation("journeys");

  return (
    <p className="journeys-map-attribution">
      {t("map.attribution")}{" "}
      <a href="https://www.geonames.org" target="_blank" rel="noreferrer">
        GeoNames
      </a>
      ,{" "}
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
        CC BY 4.0
      </a>
    </p>
  );
}
