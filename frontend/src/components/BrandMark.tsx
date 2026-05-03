import { Text } from "@mantine/core";
import { Link } from "react-router-dom";

const GLOBE_MINI_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";

export function BrandMark() {
  return (
    <Text
      component={Link}
      to="/"
      fw={400}
      fz="1.9rem"
      c="slate.9"
      style={{
        textDecoration: "none",
        letterSpacing: "-0.015em",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.02em",
        fontFamily: "var(--font-display)",
      }}
    >
      MyJ
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: "0.85em",
          height: "0.85em",
          borderRadius: "50%",
          backgroundImage: `url(${GLOBE_MINI_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow:
            "0 0 4px rgba(74, 179, 255, 0.6), inset 0 0 6px rgba(0, 0, 0, 0.35)",
        }}
      />
      urney
    </Text>
  );
}
