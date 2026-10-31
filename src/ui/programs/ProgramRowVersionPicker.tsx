import {
  ROW_VERSION_LABEL,
  ROW_VERSION_PICKER_HINT,
  versionOfRowLabel,
} from "../copy/programs.js";

export type ProgramRowVersionPickerProps = {
  rowName: string;
  selectedVersionNumber: number;
  versionOptions: readonly number[];
  onSelectVersion: (versionNumber: number) => void;
};

/** Built for DIDI-1141; not mounted until row version PATCH exists (DIDI-1140). */
export function ProgramRowVersionPicker({
  rowName,
  selectedVersionNumber,
  versionOptions,
  onSelectVersion,
}: ProgramRowVersionPickerProps) {
  const labelId = `pg-row-version-label-${rowName.replace(/\s+/g, "-")}`;

  return (
    <div className="pg-row-version">
      <p className="pg-row-version-title">{versionOfRowLabel(rowName)}</p>
      <p className="pg-row-version-hint">{ROW_VERSION_PICKER_HINT}</p>
      <label className="pg-row-version-field">
        <span id={labelId}>{ROW_VERSION_LABEL}</span>
        <select
          aria-labelledby={labelId}
          value={selectedVersionNumber}
          onChange={(event) => {
            onSelectVersion(Number(event.target.value));
          }}
        >
          {versionOptions.map((versionNumber) => (
            <option key={versionNumber} value={versionNumber}>
              {versionNumber}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
