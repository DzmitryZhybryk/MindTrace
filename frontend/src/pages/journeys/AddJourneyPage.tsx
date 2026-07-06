import { useForm } from "@mantine/form";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { JourneyForm, type JourneyFormValues } from "./JourneyForm";

// Глобус-герой (three/react-globe.gl) — отдельный chunk, грузится лениво: форма слева
// интерактивна сразу, глобус справа подтягивается следом.
const JourneyGlobe = lazy(() => import("../../components/JourneyGlobe").then((m) => ({ default: m.JourneyGlobe })));

/**
 * Под-вкладка «Добавить путешествие» — маршрут /journeys/add. Двухпанельный экран:
 * слева форма, справа глобус-герой, который вживую рисует маршрут по вводу. `form`
 * поднят сюда, чтобы оба под-компонента читали одно состояние. Рендерится в
 * <Outlet/> каркаса JourneysLayout (шапка и левая панель — снаружи).
 */
export function AddJourneyPage() {
  const { t } = useTranslation("journeys");

  const form = useForm<JourneyFormValues>({
    mode: "controlled",
    initialValues: {
      origin: null,
      destination: null,
      transport: null,
      year: null,
      month: null,
      day: null,
      hasMonth: false,
      hasDay: false,
    },
    // Валидаторы возвращают i18n-ТОКЕН (`journeys:addJourney.validation.*`), а не
    // готовый текст: резолв в строку — при рендере (`resolveErrorToken`), чтобы
    // ошибка переключалась на новый язык вместе с интерфейсом.
    validate: {
      origin: (value) => (value ? null : "journeys:addJourney.validation.originRequired"),
      destination: (value, values) => {
        if (!value) {
          return "journeys:addJourney.validation.destinationRequired";
        }
        // Идентичность места — placeId справочника: предвалидируем тот же город ещё на
        // фронте (бэк всё равно проверит по координатам). placeId на create не уходит.
        if (values.origin && values.origin.placeId === value.placeId) {
          return "journeys:addJourney.validation.sameCity";
        }
        return null;
      },
      transport: (value) => (value ? null : "journeys:addJourney.validation.transportRequired"),
      year: (value) => (value ? null : "journeys:addJourney.validation.yearRequired"),
      month: (value, values) => (values.hasMonth && !value ? "journeys:addJourney.validation.monthRequired" : null),
      day: (value, values) => (values.hasDay && !value ? "journeys:addJourney.validation.dayRequired" : null),
    },
  });

  const values = form.getValues();

  return (
    <div className="add-journey">
      <div className="add-journey__form-col">
        <section className="add-journey__card journeys-card" aria-label={t("addJourney.title")}>
          <h1 className="add-journey__title">{t("addJourney.title")}</h1>
          <p className="add-journey__subtitle">{t("addJourney.subtitle")}</p>
          <JourneyForm form={form} />
        </section>
      </div>

      <div className="add-journey__globe-col">
        <Suspense fallback={null}>
          <JourneyGlobe
            origin={values.origin}
            destination={values.destination}
            transportType={values.transport}
            originLabel={values.origin?.name?.trim() ?? ""}
            destinationLabel={values.destination?.name?.trim() ?? ""}
          />
        </Suspense>
      </div>
    </div>
  );
}
