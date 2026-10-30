const JSON_HEADERS = { "content-type": "application/json" };

function hasPractitionerIdKey(record: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, "practitionerId") ||
    Object.prototype.hasOwnProperty.call(record, "practitioner_id")
  );
}

function containsPractitionerIdField(value: unknown, deep: boolean): boolean {
  if (!deep) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return hasPractitionerIdKey(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsPractitionerIdField(entry, true));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (hasPractitionerIdKey(record)) {
    return true;
  }
  return Object.values(record).some((entry) =>
    containsPractitionerIdField(entry, true),
  );
}

export function rejectBodyPractitionerId(
  body: Record<string, unknown>,
  options: { deep?: boolean } = {},
): Response | null {
  if (containsPractitionerIdField(body, options.deep === true)) {
    return Response.json(
      { error: "invalid_input", message: "invalid_input" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  return null;
}
