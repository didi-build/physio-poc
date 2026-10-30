import { expect } from "vitest";

export const INVALID_INPUT_QUERY_GUARD_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

export function practitionerIdQuerySuffix(otherPractitionerId: string): string {
  return `?practitionerId=${encodeURIComponent(otherPractitionerId)}`;
}

export function practitionerUnderscoreIdQuerySuffix(
  otherPractitionerId: string,
): string {
  return `?practitioner_id=${encodeURIComponent(otherPractitionerId)}`;
}

export function sortedHeaderEntries(response: Response): [string, string][] {
  return [...response.headers.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
}

let cachedExpectedHeaders: [string, string][] | null = null;

export function rememberInvalidInputQueryGuardHeaders(response: Response): void {
  cachedExpectedHeaders = sortedHeaderEntries(response);
}

export async function expectInvalidInputQueryGuardResponse(
  response: Response,
): Promise<void> {
  expect(response.status).toBe(400);
  expect(await response.text()).toBe(JSON.stringify(INVALID_INPUT_QUERY_GUARD_BODY));
  const headers = sortedHeaderEntries(response);
  if (cachedExpectedHeaders === null) {
    rememberInvalidInputQueryGuardHeaders(response);
  } else {
    expect(headers).toEqual(cachedExpectedHeaders);
  }
}
