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

// Намеренно отдельный цвет от slate: deep-space с лёгким сине-фиолетовым оттенком,
// якорный для брендовых поверхностей (кнопки auth, ядро глобуса).
const space: MantineColorsTuple = [
  "#e7eaf3",
  "#c4cae0",
  "#9ba4c5",
  "#727faa",
  "#4f5d8f",
  "#34406f",
  "#212c52",
  "#141d3f",
  "#0a1230",
  "#04081a",
];

export const theme = createTheme({
  primaryColor: "slate",
  primaryShade: 6,
  colors: { slate, space },
  fontFamily: "var(--font-body)",
  headings: { fontFamily: "var(--font-display)", fontWeight: "500" },
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
