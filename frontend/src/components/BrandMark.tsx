import { Text } from "@mantine/core";
import { Link } from "react-router-dom";

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
      {/*
        Глобус-«o» — вектор-глиф (graticule: контур + меридиан + экватор), чёткий на
        любом размере. Заменил фото-текстуру (мутнела мелко) и заодно убрал CDN-зависимость
        для логотипа. Цвет контура — brand-ink (#0a1230), заливка — светлый перивинкл под
        палитру auth/app-фона; марк всегда на светлом фоне (шапки auth и app).
      */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        style={{ width: "0.85em", height: "0.85em", display: "inline-block" }}
      >
        <circle cx="50" cy="50" r="46" fill="#dbe7fb" stroke="#0a1230" strokeWidth="6" />
        <ellipse cx="50" cy="50" rx="18" ry="46" fill="none" stroke="#0a1230" strokeWidth="4" />
        <line x1="6" y1="50" x2="94" y2="50" stroke="#0a1230" strokeWidth="4" />
      </svg>
      urney
    </Text>
  );
}
