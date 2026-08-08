# Web Performance

> Applies to `frontend/` (React + Vite + Mantine).

## Core Web Vitals Targets

| Metric | Target |
|--------|--------|
| LCP    | < 2.5s |
| INP    | < 200ms |
| CLS    | < 0.1 |
| FCP    | < 1.5s |

## Bundle Budget (gzipped)

| Page | JS | CSS |
|------|----|----|
| Landing | < 200kb | < 40kb |
| App page | < 300kb | < 50kb |

Цифры для лендинга подняты со 150/30 после замера (2026-07-19): пол стека — **~116 kb** и он
несжимаем без смены архитектуры. Из чего он состоит:

| часть | gz | устранимо? |
|---|---|---|
| react-dom | 56.4 kb | нет |
| i18n-стек | 23.8 kb | нет, копирайт лендинга в i18n |
| zod | 17.4 kb | нет, валидация ответов API на границе |
| react-router | 15.0 kb | нет |
| код приложения | ~4 kb | — |

Сверху ложится Mantine. Лендинг ни одного его компонента не использует, но `MantineProvider`
смонтирован в корне, а `PublicHeader` тянет переключатель языка на Mantine `Menu`
(`FocusTrap` + `Popover` + `Input` ≈ 24 kb). Уложиться в 150 kb можно только вынеся провайдер
из корня и переписав переключатель — при том что `/login` и `/signup` живут в том же лейауте
и Mantine им нужен по-настоящему. Разменивать перекройку провайдерного дерева на 35 kb
сочли невыгодным.

> **Бюджет, который нельзя выполнить, не дисциплинирует, а приучает игнорировать таблицу.**
> Если меняешь цифры — меняй вместе с обоснованием, почему новая достижима.

Замерять критический путь по ГРАФУ СТАТИЧЕСКИХ ИМПОРТОВ собранных чанков, а не по размеру
entry: динамический `import()` попадает в манифест предзагрузки и легко читается как
статическая зависимость.

## Loading Strategy

- Preload only the hero image and primary font
- Heavy libraries (`react-globe.gl`, `three.js`) — dynamic `import()` only on the globe page
- Defer non-critical CSS/JS

## Images

- Always set explicit `width` and `height`
- Hero — `loading="eager"` + `fetchpriority="high"`
- Below-the-fold — `loading="lazy"`
- AVIF/WebP with fallbacks; do not serve originals larger than the rendered size

## Fonts

- ≤ 2 families, `font-display: swap`, preload only the critical weight

## Animation

- Animate only compositor-friendly properties (transform/opacity)
- Use `will-change` sparingly and remove it afterward
- JS animations — `requestAnimationFrame` or libraries; do not attach heavy scroll handlers (use `IntersectionObserver`)

## UI Quality (manual checks)

Автотесты у фронта есть (vitest unit + component, Playwright e2e, гейт покрытия 90% — см.
[typescript/testing.md](../typescript/testing.md)), и они гоняются в CI. Но ниже — то, чего
автотест не видит в принципе: как оно ВЫГЛЯДИТ. Проверять перед мержем UI-изменений:

- **A11y:** axe-core / Lighthouse a11y, keyboard navigation, `prefers-reduced-motion`, WCAG AA contrast (4.5:1 / 3:1)
- **Performance:** Lighthouse on key pages (login, signup, home, globe); check INP during globe interaction
- **Cross-browser:** Chrome / Firefox / Safari (desktop)
- **Responsive:** breakpoints 320 / 375 / 768 / 1024 / 1440; tap targets ≥ 44×44px
