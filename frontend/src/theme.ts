import { createTheme, type MantineColorsTuple } from "@mantine/core";

const slate: MantineColorsTuple = [
  "#f8fafc",
  "#f1f5f9",
  "#e2e8f0",
  "#cbd5e1",
  "#94a3b8",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
  "#0f172a",
];

// Акцент редизайна — golden-hour терракота. Основной оттенок (--sun #e8935c) на
// shade 6 (primaryShade), тёмный (--sun-deep #cf6a3a) на 7 (hover filled-кнопок).
const sun: MantineColorsTuple = [
  "#fdf4ed",
  "#f7e4d3",
  "#eecaa7",
  "#e6b17d",
  "#e19a5c",
  "#dd8f4e",
  "#e8935c",
  "#cf6a3a",
  "#ad5620",
  "#8c4310",
];

/*
 * Стеки шрифтов НЕ дублируем литералом — берём те же CSS-переменные, что объявлены в
 * `index.css`. Раньше стек жил в двух местах сразу, и третья копия в `globe-label.css`
 * уже успела разойтись с оригиналом. Один источник истины — `:root`.
 */
const bodyFont = "var(--font-body)";
const displayFont = "var(--font-display)";

export const theme = createTheme({
  primaryColor: "sun",
  primaryShade: 6,
  colors: { slate, sun },
  /*
   * Метку на залитой акцентом кнопке выбирает Mantine, а не каждый экран вручную. Закат
   * `#e8935c` светлый (luminance 0.388 против порога 0.179), поэтому белая метка давала
   * 2.4:1 — ниже AA. С `autoContrast` подставляется тёмная: 7.2:1.
   *
   * `black` переопределён намеренно: autoContrast берёт именно `theme.black`, а дефолтный
   * чистый #000 по терракоте звучит грубее, чем спроектированный `--on-sun`. Значение то же,
   * что у токена, — тогда Mantine и CSS дают один цвет, а не два похожих.
   */
  autoContrast: true,
  black: "#2a1608",
  fontFamily: bodyFont,
  headings: { fontFamily: displayFont, fontWeight: "600" },
  defaultRadius: "md",
  radius: {
    xs: "4px",
    sm: "8px",
    md: "10px",
    lg: "16px",
    xl: "20px",
  },
  cursorType: "pointer",
});
