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

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const theme = createTheme({
  primaryColor: "slate",
  primaryShade: 6,
  colors: { slate },
  fontFamily: fontStack,
  headings: { fontFamily: fontStack, fontWeight: "600" },
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
