export class OpaqueEntityIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpaqueEntityIdValidationError";
  }
}

/** Accepted format: RFC 4122 UUID version 4 (same shape as `crypto.randomUUID()`). */
export const OPAQUE_ENTITY_ID_FORMAT =
  "UUID v4: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx (hex, case insensitive)";

/**
 * Practitioner ids on exercise data rows are `practitioners.id` values, not Better Auth
 * `user.id`. DIDI-1001 (`BetterAuthPort.getPractitioner`) loads the practitioner row by
 * session email and exposes that row's id as `PractitionerSession.practitionerId`. Better
 * Auth still generates its own opaque ids for auth tables (`user`, `session`, `account`);
 * those stay in the auth schema and are not written through these repositories. New
 * practitioner rows inserted via `PractitionersRepository` must use UUID v4 ids here.
 */

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOpaqueEntityId(id: string): boolean {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return UUID_V4_PATTERN.test(trimmed);
}

export function validateOpaqueEntityId(id: string, fieldLabel: string): string {
  const trimmed = id.trim();
  if (!isValidOpaqueEntityId(trimmed)) {
    throw new OpaqueEntityIdValidationError(
      `${fieldLabel} must be a UUID v4 opaque id`,
    );
  }
  return trimmed.toLowerCase();
}

export function generateOpaqueEntityId(): string {
  return crypto.randomUUID();
}
