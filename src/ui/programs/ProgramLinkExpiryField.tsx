import { useId, useMemo } from "react";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { torontoTomorrowEarliestDateOnly } from "../../domain/toronto-calendar.js";
import {
  EXPIRY_DEFAULT_MARK,
  expiryChoiceLabel,
  LINK_STOPS_WORKING_ON,
  PICK_A_DATE_HINT,
} from "../copy/program-publish.js";

export const PROGRAM_LINK_EXPIRY_CHOICES = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
  SHARE_LINK_EXPIRES_IN.custom_date,
] as const;

export type ProgramLinkExpiryFieldProps = {
  value: ShareLinkExpiresIn;
  customDate: string;
  defaultChoice?: ShareLinkExpiresIn;
  disabled?: boolean;
  onChange: (expiresIn: ShareLinkExpiresIn) => void;
  onCustomDateChange: (value: string) => void;
};

export function ProgramLinkExpiryField({
  value,
  customDate,
  defaultChoice = SHARE_LINK_EXPIRES_IN.one_year,
  disabled = false,
  onChange,
  onCustomDateChange,
}: ProgramLinkExpiryFieldProps) {
  const dateInputId = useId();
  const minDate = useMemo(() => torontoTomorrowEarliestDateOnly(new Date()), []);

  return (
    <div className="pg-expiry-field">
      <div className="pg-expiry-picker" role="group" aria-label="Link expires">
        {PROGRAM_LINK_EXPIRY_CHOICES.map((choice) => {
          const isDefault = choice === defaultChoice;
          const label = expiryChoiceLabel(choice);
          const text =
            isDefault && choice !== SHARE_LINK_EXPIRES_IN.custom_date
              ? `${label} (${EXPIRY_DEFAULT_MARK})`
              : label;
          return (
            <button
              key={choice}
              type="button"
              className={`pg-expiry-chip${
                value === choice ? " pg-expiry-chip--active" : ""
              }${isDefault ? " pg-expiry-chip--default" : ""}`}
              aria-pressed={value === choice}
              disabled={disabled}
              onClick={() => {
                onChange(choice);
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
      {value === SHARE_LINK_EXPIRES_IN.custom_date ? (
        <div className="pg-expiry-custom">
          <label htmlFor={dateInputId} className="pg-expiry-custom-label">
            {LINK_STOPS_WORKING_ON}
          </label>
          <input
            id={dateInputId}
            type="date"
            className="pg-expiry-date-input"
            min={minDate}
            value={customDate}
            disabled={disabled}
            onChange={(event) => {
              onCustomDateChange(event.target.value);
            }}
          />
          <p className="pg-expiry-custom-hint">{PICK_A_DATE_HINT}</p>
        </div>
      ) : null}
    </div>
  );
}
