/** Canonical opaque entity ids (UUID v4, lowercase hex). */

export const OPAQUE_ENTITY_ID_LENGTH = 36;

export const OPAQUE_ENTITY_ID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

const opaqueEntityIdRegex = new RegExp(OPAQUE_ENTITY_ID_PATTERN);

export function validateOpaqueEntityId(value: string): boolean {
  return value.length === OPAQUE_ENTITY_ID_LENGTH && opaqueEntityIdRegex.test(value);
}
