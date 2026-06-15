import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { JourneyGlobe } from "../../components/JourneyGlobe";
import { JourneyForm, type JourneyFormValues } from "./JourneyForm";

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
    validate: {
      origin: (value) => (value ? null : t("addJourney.validation.originRequired")),
      destination: (value, values) => {
        if (!value) {
          return t("addJourney.validation.destinationRequired");
        }
        // geonameId > 0 — только реальный выбор из автокомплита; провизорный
        // свободный ввод (sentinel 0) на этом шаге «тем же городом» не считаем.
        if (values.origin && value.geonameId > 0 && values.origin.geonameId === value.geonameId) {
          return t("addJourney.validation.sameCity");
        }
        return null;
      },
      transport: (value) => (value ? null : t("addJourney.validation.transportRequired")),
      year: (value) => (value ? null : t("addJourney.validation.yearRequired")),
      month: (value, values) => (values.hasMonth && !value ? t("addJourney.validation.monthRequired") : null),
      day: (value, values) => (values.hasDay && !value ? t("addJourney.validation.dayRequired") : null),
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
        <JourneyGlobe
          origin={values.origin}
          destination={values.destination}
          transportType={values.transport}
          originLabel={values.origin?.name?.trim() || t("addJourney.origin.label")}
          destinationLabel={values.destination?.name?.trim() || t("addJourney.destination.label")}
        />
      </div>
    </div>
  );
}
