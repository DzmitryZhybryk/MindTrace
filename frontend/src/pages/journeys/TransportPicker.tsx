import { Chip, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { zTransportType, type TransportType } from "../../api/sdk";
import { TransportLabel } from "../../components/TransportLabel";

interface TransportPickerProps {
  value: TransportType | null;
  onChange: (value: TransportType) => void;
  error?: string;
}

/** Выбор одного вида транспорта чипами «иконка + подпись». */
export function TransportPicker({ value, onChange, error }: TransportPickerProps) {
  const { t } = useTranslation("journeys");

  return (
    <fieldset className="transport-picker">
      <legend className="transport-picker__label">{t("addJourney.transport.label")}</legend>
      <Chip.Group value={value ?? ""} onChange={(next) => onChange(next as TransportType)}>
        <div className="transport-picker__row">
          {zTransportType.options.map((type) => (
            <Chip key={type} value={type} variant="outline" size="md" className="transport-picker__chip">
              <TransportLabel type={type} />
            </Chip>
          ))}
        </div>
      </Chip.Group>
      {error && (
        <Text size="sm" fw={500} c="var(--text-error)">
          {error}
        </Text>
      )}
    </fieldset>
  );
}
