import { useForm } from "@mantine/form";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useGlobeSceneActions, type GlobeSlot } from "../../components/globe/globeScene";
import type { GlobeRoute } from "../../components/globe/route";
import { JourneyForm, type JourneyFormValues } from "./JourneyForm";

/**
 * Прямоугольник слота во viewport-координатах; нулевой размер (колонка скрыта на узком
 * экране — `display: none`) означает «места под глобус нет».
 */
function measureSlot(element: HTMLElement): GlobeSlot | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Под-вкладка «Добавить путешествие» — маршрут /journeys/add. Двухпанельный экран:
 * слева форма, справа место под глобус-героя, который вживую рисует маршрут по вводу.
 * Сам глобус — app-global `PersistentGlobeHost`: страница лишь публикует ему маршрут и
 * прямоугольник своей колонки, поэтому уход на /home — перелёт той же планеты, а не
 * смена двух разных. Рендерится в <Outlet/> каркаса JourneysLayout.
 */
export function AddJourneyPage() {
  const { t } = useTranslation("journeys");
  const { setRoute, setSlot } = useGlobeSceneActions();
  const slotRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<JourneyFormValues>({
    mode: "controlled",
    initialValues: {
      origin: null,
      destination: null,
      transport: null,
      year: null,
    },
    // Валидаторы возвращают i18n-ТОКЕН (`journeys:addJourney.validation.*`), а не
    // готовый текст: резолв в строку — при рендере (`resolveErrorToken`), чтобы
    // ошибка переключалась на новый язык вместе с интерфейсом.
    validate: {
      origin: (value) => {
        if (!value) {
          return "journeys:addJourney.validation.originRequired";
        }
        // Поездка хранит страну места; справочник допускает места без неё (моря, океаны).
        return value.countryCode ? null : "journeys:addJourney.validation.placeWithoutCountry";
      },
      destination: (value, values) => {
        if (!value) {
          return "journeys:addJourney.validation.destinationRequired";
        }
        if (!value.countryCode) {
          return "journeys:addJourney.validation.placeWithoutCountry";
        }
        // Тот же город отсекаем ещё на фронте; бэк проверит то же самое по placeId.
        if (values.origin && values.origin.placeId === value.placeId) {
          return "journeys:addJourney.validation.sameCity";
        }
        return null;
      },
      transport: (value) => (value ? null : "journeys:addJourney.validation.transportRequired"),
      year: (value) => (value ? null : "journeys:addJourney.validation.yearRequired"),
    },
  });

  const { origin, destination, transport } = form.getValues();

  // Identity маршрута — по его полям, а не по рендеру: controlled-форма перерисовывается
  // на каждый ввод (дата, чекбоксы), и новый объект на каждом рендере гонял бы хост впустую.
  const route = useMemo<GlobeRoute>(
    () => ({
      origin,
      destination,
      transportType: transport,
      originLabel: origin?.name?.trim() ?? "",
      destinationLabel: destination?.name?.trim() ?? "",
    }),
    [origin, destination, transport],
  );

  useEffect(() => {
    setRoute(route);
  }, [route, setRoute]);

  useEffect(() => () => setRoute(null), [setRoute]);

  // Слот меряем и по размеру (ResizeObserver: баннер в потоке, смена брейкпоинта), и по окну
  // (сдвиг колонки без смены её размера ResizeObserver не видит).
  useEffect(() => {
    const element = slotRef.current;
    if (!element) return;

    const publish = () => setSlot(measureSlot(element));
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);
    publish();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      setSlot(null);
    };
  }, [setSlot]);

  return (
    <div className="add-journey">
      <div className="add-journey__form-col">
        <section className="add-journey__card journeys-card" aria-label={t("addJourney.title")}>
          <h1 className="add-journey__title">{t("addJourney.title")}</h1>
          <p className="add-journey__subtitle">{t("addJourney.subtitle")}</p>
          <JourneyForm form={form} />
        </section>
      </div>

      {/* Пустой слот под глобус: жесты сквозь него уходят планете (контракт — persistent-globe.css). */}
      <div ref={slotRef} className="add-journey__globe-col" data-globe-slot />
    </div>
  );
}
