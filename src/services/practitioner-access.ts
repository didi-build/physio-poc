import type { PractitionersRepository } from "../storage/repositories/exercise-data.js";

/** Thrown when the path practitioner id does not match a row (swap point for DIDI-1059 session auth). */
export class PractitionerNotFoundError extends Error {
  constructor() {
    super("Practitioner not found");
    this.name = "PractitionerNotFoundError";
  }
}

export async function requirePractitionerRecord(
  practitioners: PractitionersRepository,
  practitionerId: string,
): Promise<void> {
  const row = await practitioners.findById(practitionerId);
  if (!row) {
    throw new PractitionerNotFoundError();
  }
}
