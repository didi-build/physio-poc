const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OpaqueEntityIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpaqueEntityIdError";
  }
}

/** Validates caller-supplied ids (UUID v4). Server-generated ids use newOpaqueEntityId(). */
export function validateOpaqueEntityId(id: string, fieldLabel = "id"): string {
  if (!UUID_V4_PATTERN.test(id)) {
    throw new OpaqueEntityIdError(`Invalid ${fieldLabel}`);
  }
  return id.toLowerCase();
}

export function newOpaqueEntityId(): string {
  return crypto.randomUUID().toLowerCase();
}
