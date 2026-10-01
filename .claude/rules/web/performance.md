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

The numbers are a working agreement, not a physical limit. They were set by eye, raised for the
landing from 150/30 after a measurement (2026-07-19), and re-checked on 2026-10-01. Going over
is a reason to look at what grew, not an alarm: if nothing removable is found, raise the limit
and write down why.

Landing composition at the 2026-10-01 check (~185 kb, shares attributed per package):

| part | gz | removable? |
|---|---|---|
| react + react-dom | ~63 kb | no |
| Mantine (+ floating-ui) | ~51 kb | not worth it, see below |
| i18n stack | ~22 kb | no — the landing copy lives in i18n |
| react-router | ~15 kb | no |
| app code | ~15 kb | — |
| TanStack Query | ~10 kb | no — the root providers use it |
| zod (`zod/mini`) | ~8 kb | already minimal — API responses are validated at the boundary |

Mantine is the only large removable block, and removing it is not worth it. The landing itself
uses no Mantine component, but `MantineProvider` sits at the root and `PublicHeader` renders the
language switcher on Mantine `Menu`. Moving it off the landing means pulling the provider out of
the root and rewriting the switcher with its keyboard and focus handling — and `/login` and
`/signup`, the landing's next step, load the same chunks anyway. The bytes would only move one
navigation later.

What did pay off was dead weight on every page: the email-verification dialog imported
statically into the root `AuthProvider` (−14 kb, now `lazy`), and the generated SDK validators on
classic zod (−18 kb, now `zod/mini` via the `@hey-api/openapi-ts` zod plugin option). Before
optimizing, check for the same kind of thing — something on the critical path that the page
never renders.

> **Бюджет, который нельзя выполнить, не дисциплинирует, а приучает игнорировать таблицу.**
> Если меняешь цифры — меняй вместе с обоснованием, почему новая достижима.

Замерять критический путь по ГРАФУ СТАТИЧЕСКИХ ИМПОРТОВ собранных чанков, а не по размеру
entry: динамический `import()` попадает в манифест предзагрузки и легко читается как
статическая зависимость.

**Check it with `make fe-budget`, not by hand.** It builds with the Vite manifest, walks each
route's static import graph (entry + lazy layout + page) and fails when a page exceeds its
limit. The limits are duplicated in `frontend/scripts/check-bundle-budget.ts` — change both
together. A new lazy route has to be added to that script's page list, or it goes unmeasured.

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
