/** Client-side match for server invalid_input on note fields with patient-detail guard. */
export function isPatientDetailNoteInvalidInput(detail: {
  status?: number;
  error?: string;
  message?: string;
}): boolean {
  if (detail.status !== 400 || detail.error !== "invalid_input") {
    return false;
  }
  const message = detail.message ?? "";
  return /patient/i.test(message);
}
