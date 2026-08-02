import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";

import "./landing.css";

/** Копирайт-элемент секции «фичи» (из i18n `landing:features.items`). */
interface FeatureItem {
  stamp: string;
  title: string;
  body: string;
}

/** Шаг итинерария (из i18n `landing:steps.items`). */
interface StepItem {
  no: string;
  title: string;
  body: string;
  stamp: string;
}

/** Ячейка статистики примера-атласа (из i18n `landing:atlas.stats`). */
interface AtlasStat {
  value: string;
  label: string;
}

const BRAND = "MyJourney";

/**
 * Массив объектов из i18n или пустой массив.
 *
 * `t(key, { returnObjects: true })` типизирован как `string`, поэтому раньше здесь стоял
 * тройной каст `as unknown as T[]`. Каст молчит и в том случае, когда ключа нет: i18next
 * возвращает саму строку-ключ, `.map` по строке падает — и лендинг, единственная страница
 * для анонима, уходит в белый экран из-за опечатки в JSON. Проверяем форму на границе.
 */
function itemsFromTranslation<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Публичный лендинг MyJourney. Hero прозрачен — сквозь него виден персистентный глобус из
 * `PublicLayout`; ниже контент (фичи → как работает → пример-атлас) лежит на непрозрачной
 * ночи, закрывающей планету, и завершается футером-CTA.
 *
 * Ритм страницы держится ВЫСОТОЙ поверхности, а не инверсией яркости: полоса «как это
 * работает» приподнята, карточки обведены волосяной линией, журнальная вырезка утоплена
 * глубже фона. (Ранняя версия разводила секции светлой «ивори»-обёрткой — от неё отказались,
 * когда поверхность продукта стала единой ночью на обоих берегах логина.)
 *
 * Весь копирайт — из i18n-namespace `landing` (EN/RU). Собственного глобуса нет: фон приходит
 * из лейаута, поэтому один WebGL-инстанс переживает переход в auth-зону.
 */
export function LandingPage() {
  const { t } = useTranslation("landing");

  const features = itemsFromTranslation<FeatureItem>(t("features.items", { returnObjects: true }));
  const steps = itemsFromTranslation<StepItem>(t("steps.items", { returnObjects: true }));
  const stats = itemsFromTranslation<AtlasStat>(t("atlas.stats", { returnObjects: true }));

  return (
    <div className="lp">
      {/* Шапка — общая для публичной зоны, живёт в `PublicLayout` (переживает навигацию). */}

      {/* --- Hero (прозрачный — за ним фиксированный глобус) --- */}
      <section className="lp-hero">
        <div className="lp-hero__scrim" />

        <div className="lp-hero__inner">
          <div className="lp-hero__copy">
            <p className="lp-eyebrow">{t("hero.eyebrow")}</p>
            <h1 className="lp-hero__title">
              <Trans t={t} i18nKey="hero.title" components={{ em: <em /> }} />
            </h1>
            <p className="lp-hero__sub">{t("hero.sub")}</p>

            <div className="lp-hero__cta">
              <Link to="/signup" className="lp-btn lp-btn--sun">
                {t("hero.primaryCta")}
              </Link>
              <Link to="/login" className="lp-btn lp-btn--ghost">
                {t("hero.secondaryCta")}
              </Link>
            </div>

            <div className="lp-strip">
              <span className="lp-strip__dot" />
              <span className="lp-strip__hi">LIS</span>
              <span>→</span>
              <span className="lp-strip__hi">MAR</span>
              <span className="lp-strip__sep">·</span>
              <span>{t("hero.stripHour")}</span>
              <span className="lp-strip__sep">·</span>
              <span>{t("hero.stripSaved")}</span>
            </div>
          </div>
        </div>

        <span className="lp-scroll" aria-hidden>
          {t("scroll")}
          <span className="lp-scroll__line" />
        </span>
      </section>

      {/* --- Контент (непрозрачная ивори-обёртка поверх глобуса) --- */}
      <div className="lp-content">
        {/* Фичи */}
        <section className="lp-section lp-features">
          <div className="lp-section__head">
            <p className="lp-eyebrow">{t("features.eyebrow")}</p>
            <h2 className="lp-section__title">{t("features.title")}</h2>
            <p className="lp-section__lead">{t("features.lead")}</p>
          </div>

          <div className="lp-features__grid">
            {features.map((feature) => (
              <article key={feature.title} className="lp-card">
                <span className="lp-card__stamp">{feature.stamp}</span>
                <h3 className="lp-card__title">{feature.title}</h3>
                <p className="lp-card__body">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="lp-rule" />

        {/* Как это работает */}
        <section className="lp-section lp-steps">
          <div className="lp-steps__wrap">
            <div className="lp-section__head">
              <p className="lp-eyebrow">{t("steps.eyebrow")}</p>
              <h2 className="lp-section__title">{t("steps.title")}</h2>
            </div>

            <ol className="lp-steps__list">
              {steps.map((step) => (
                <li key={step.no} className="lp-step">
                  <span className="lp-step__no">{step.no}</span>
                  <h3 className="lp-step__title">{step.title}</h3>
                  <p className="lp-step__body">{step.body}</p>
                  <span className="lp-step__stamp">{step.stamp}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="lp-rule" />

        {/* Пример-атлас + журнальная запись */}
        <section className="lp-section lp-atlas">
          <div className="lp-section__head">
            <p className="lp-eyebrow">{t("atlas.eyebrow")}</p>
            <h2 className="lp-section__title">{t("atlas.title")}</h2>
          </div>

          <div className="lp-atlas__grid">
            <div className="lp-atlas__stats">
              {stats.map((stat) => (
                <div key={stat.label} className="lp-stat">
                  <div className="lp-stat__value">{stat.value}</div>
                  <div className="lp-stat__label">{stat.label}</div>
                </div>
              ))}
            </div>

            <figure className="lp-journal">
              <figcaption className="lp-journal__date">{t("atlas.journalDate")}</figcaption>
              {/* Кавычки — часть строки перевода, а не разметки: в русском «ёлочки»,
                  в английском “лапки”, и захардкоженная пара давала английские кавычки
                  вокруг русского текста. */}
              <blockquote className="lp-journal__quote">{t("atlas.journalQuote")}</blockquote>
              <div className="lp-journal__from">— {t("atlas.journalFrom")}</div>
            </figure>
          </div>
        </section>
      </div>

      {/* --- Футер-CTA --- */}
      <footer className="lp-foot">
        <div className="lp-foot__inner">
          <p className="lp-eyebrow">{BRAND}</p>
          <h2 className="lp-foot__title">{t("footer.title")}</h2>
          <p className="lp-foot__sub">{t("footer.sub")}</p>

          <div className="lp-foot__cta">
            <Link to="/signup" className="lp-btn lp-btn--sun">
              {t("footer.primaryCta")}
            </Link>
            <Link to="/login" className="lp-btn lp-btn--ghost">
              {t("footer.secondaryCta")}
            </Link>
          </div>

          <div className="lp-foot__meta">
            <span>© {BRAND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
