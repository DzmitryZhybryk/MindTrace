import { Text } from "@mantine/core";
import { Link } from "react-router-dom";

import { GLOBE_TEXTURE_URL } from "./globe/constants";

export function BrandMark() {
  return (
    <Text
      component={Link}
      to="/"
      fw={600}
      fz="1.8rem"
      c="slate.8"
      style={{
        textDecoration: "none",
        letterSpacing: "-0.01em",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.02em",
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
          backgroundImage: `url(${GLOBE_TEXTURE_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "0 0 4px rgba(74, 179, 255, 0.6), inset 0 0 6px rgba(0, 0, 0, 0.35)",
        }}
      />
      urney
    </Text>
  );
}
