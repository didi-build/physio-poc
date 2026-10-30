export class OpaqueEntityIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpaqueEntityIdValidationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lowercase alphanumeric segments separated by hyphens (matches seeded test ids such as prog-1). */
const OPAQUE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isValidOpaqueEntityId(id: string): boolean {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return UUID_PATTERN.test(trimmed) || OPAQUE_ID_PATTERN.test(trimmed);
}

export function validateOpaqueEntityId(id: string, fieldLabel: string): string {
  const trimmed = id.trim();
  if (!isValidOpaqueEntityId(trimmed)) {
    throw new OpaqueEntityIdValidationError(
      `${fieldLabel} must match the opaque id format`,
    );
  }
  return trimmed;
}
