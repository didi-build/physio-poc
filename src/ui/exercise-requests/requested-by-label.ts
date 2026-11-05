import { ACCOUNT_DISPLAY_NAME } from "../copy/a11y.js";
import { DEV_PRACTITIONER_ID } from "../api/exercise-library-client.js";

export function requestedByLabel(input: {
  requestedBy: string;
  requestedByEmail: string;
  currentPractitionerId?: string;
}): string {
  const current = input.currentPractitionerId ?? DEV_PRACTITIONER_ID;
  if (input.requestedBy === current) {
    return ACCOUNT_DISPLAY_NAME;
  }
  const email = input.requestedByEmail.trim();
  if (email.includes("@")) {
    const local = email.split("@")[0] ?? email;
    if (local.length > 0) {
      return local.charAt(0).toUpperCase() + local.slice(1);
    }
  }
  return email;
}
