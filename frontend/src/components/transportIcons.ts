import type { TransportType } from "../api/sdk";
import carIcon from "../assets/emoji/car.svg";
import planeIcon from "../assets/emoji/plane.svg";
import shipIcon from "../assets/emoji/ship.svg";

/** Иконка среды передвижения (Noto-эмодзи SVG); подпись к ней — из i18n. */
export const TRANSPORT_ICONS: Readonly<Record<TransportType, string>> = {
  land: carIcon,
  air: planeIcon,
  water: shipIcon,
};
