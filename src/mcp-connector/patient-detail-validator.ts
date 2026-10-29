/**
 * Regression guard for obvious patient details in free text (DIDI-991 server enforcement).
 * Not a guarantee of privacy compliance; see ADR 0005 and DIDI-594.
 */

export type PatientDetailValidationResult =
  { ok: true } | { ok: false; reason: PatientDetailRejectionReason; message: string };

export type PatientDetailRejectionReason =
  "email" | "phone" | "health_card" | "date_of_birth";

export const PATIENT_DETAIL_REJECTION_MESSAGE =
  "Remove patient details (names, contact information, health card numbers, and dates of birth) from this text before sending it to the connector.";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const INTERNATIONAL_PHONE_PATTERN =
  /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/;

/** North American phone shapes (fixture-safe). */
const NORTH_AMERICAN_PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

/** Ontario health card: 10 digits in 4-3-3 groups with spaces or dashes. */
const ONTARIO_HEALTH_CARD_PATTERN = /\b\d{4}[-\s]\d{3}[-\s]\d{3}\b/;

const DATE_OF_BIRTH_PATTERNS: readonly RegExp[] = [
  /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/,
  /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/,
  /\b(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b/,
  /\b(?:0?[1-9]|[12]\d|3[01])\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:0?[1-9]|[12]\d|3[01]),?\s+(?:19|20)\d{2}\b/i,
  /\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}\b/,
  /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-]\d{2}\b/,
];

export function validateFreeTextForPatientDetails(
  text: string,
  options?: { skipDateOfBirthHeuristic?: boolean },
): PatientDetailValidationResult {
  if (EMAIL_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "email",
      message: PATIENT_DETAIL_REJECTION_MESSAGE,
    };
  }
  if (INTERNATIONAL_PHONE_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "phone",
      message: PATIENT_DETAIL_REJECTION_MESSAGE,
    };
  }
  if (NORTH_AMERICAN_PHONE_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "phone",
      message: PATIENT_DETAIL_REJECTION_MESSAGE,
    };
  }
  if (ONTARIO_HEALTH_CARD_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "health_card",
      message: PATIENT_DETAIL_REJECTION_MESSAGE,
    };
  }
  if (!options?.skipDateOfBirthHeuristic) {
    for (const pattern of DATE_OF_BIRTH_PATTERNS) {
      if (pattern.test(text)) {
        return {
          ok: false,
          reason: "date_of_birth",
          message: PATIENT_DETAIL_REJECTION_MESSAGE,
        };
      }
    }
  }
  return { ok: true };
}
