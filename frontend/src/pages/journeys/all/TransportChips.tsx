import { Chip } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { zTransportType, type TransportType } from "../../../api/sdk";
import { TransportLabel } from "../../../components/TransportLabel";

interface TransportChipsProps {
  transportTypes: readonly TransportType[];
  onTransportTypesChange: (transportTypes: readonly TransportType[]) => void;
}

/** Multi-select of feed transport types: icon and label, selection shown by fill. */
export function TransportChips({ transportTypes, onTransportTypesChange }: TransportChipsProps) {
  const { t } = useTranslation("journeys");

  return (
    <Chip.Group multiple value={[...transportTypes]} onChange={(value) => onTransportTypesChange(value as TransportType[])}>
      <fieldset className="transport-chips">
        <legend className="all-journeys__filter-label">{t("all.transport")}</legend>
        <div className="transport-chips__row">
          {zTransportType.options.map((type) => (
            <Chip key={type} value={type} variant="outline" size="md" className="transport-chips__chip">
              <TransportLabel type={type} />
            </Chip>
          ))}
        </div>
      </fieldset>
    </Chip.Group>
  );
}
