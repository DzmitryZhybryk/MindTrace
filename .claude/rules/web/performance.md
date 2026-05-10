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
| Landing | < 150kb | < 30kb |
| App page | < 300kb | < 50kb |

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

There are no frontend autotests. Before merging UI changes:

- **A11y:** axe-core / Lighthouse a11y, keyboard navigation, `prefers-reduced-motion`, WCAG AA contrast (4.5:1 / 3:1)
- **Performance:** Lighthouse on key pages (login, signup, home, globe); check INP during globe interaction
- **Cross-browser:** Chrome / Firefox / Safari (desktop)
- **Responsive:** breakpoints 320 / 375 / 768 / 1024 / 1440; tap targets ≥ 44×44px
