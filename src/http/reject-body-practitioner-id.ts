const JSON_HEADERS = { "content-type": "application/json" };

function hasPractitionerIdKey(record: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, "practitionerId") ||
    Object.prototype.hasOwnProperty.call(record, "practitioner_id")
  );
}

function containsPractitionerIdField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsPractitionerIdField(entry));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (hasPractitionerIdKey(record)) {
    return true;
  }
  return Object.values(record).some((entry) => containsPractitionerIdField(entry));
}

export function rejectBodyPractitionerId(
  body: Record<string, unknown>,
): Response | null {
  if (containsPractitionerIdField(body)) {
    return Response.json(
      { error: "invalid_input", message: "invalid_input" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  return null;
}
