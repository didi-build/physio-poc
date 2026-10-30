import { inspect } from "node:util";
import { expect, vi } from "vitest";

export function inspectValue(value: unknown): string {
  return inspect(value, { depth: null });
}

/** util.inspect of a string, without the wrapping quote characters. */
export function inspectStrippedString(value: string): string {
  const rendered = inspect(value);
  if (
    (rendered.startsWith("'") && rendered.endsWith("'")) ||
    (rendered.startsWith('"') && rendered.endsWith('"'))
  ) {
    return rendered.slice(1, -1);
  }
  return rendered;
}

export function rawFormOfArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return `${arg.message} ${arg.stack ?? ""}`;
  }
  return String(arg);
}

/** Escaped form of note as it would appear inside a JSON string literal. */
export function jsonEscapedNoteFragment(note: string): string {
  return JSON.stringify(note).slice(1, -1);
}

export type ConsoleLeakExpectations = {
  note?: string;
  jsonBody?: string;
  apiKey?: string;
};

function forbiddenLeakSubstrings(expectations: ConsoleLeakExpectations): string[] {
  const forbidden: string[] = [];
  if (expectations.apiKey) {
    forbidden.push(expectations.apiKey);
  }
  if (expectations.jsonBody) {
    forbidden.push(expectations.jsonBody);
    forbidden.push(inspectStrippedString(expectations.jsonBody));
  }
  if (expectations.note) {
    forbidden.push(expectations.note);
    forbidden.push(jsonEscapedNoteFragment(expectations.note));
    forbidden.push(inspectStrippedString(expectations.note));
  }
  return forbidden;
}

export function assertLeakFreeText(
  text: string,
  expectations: ConsoleLeakExpectations,
): void {
  for (const fragment of forbiddenLeakSubstrings(expectations)) {
    expect(text).not.toContain(fragment);
  }
}

export function assertArgLeakFree(
  arg: unknown,
  expectations: ConsoleLeakExpectations,
): void {
  assertLeakFreeText(rawFormOfArg(arg), expectations);
  assertLeakFreeText(inspectValue(arg), expectations);
}

function collectLeakProbeValues(root: unknown): unknown[] {
  const seen = new Set<unknown>();
  const values: unknown[] = [];

  function add(value: unknown): void {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === "object" || typeof value === "function") {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    values.push(value);

    if (value instanceof Error) {
      if (value.cause !== undefined) {
        add(value.cause);
      }
      for (const key of Object.getOwnPropertyNames(value)) {
        add((value as unknown as Record<string, unknown>)[key]);
      }
      return;
    }

    if (typeof value === "object") {
      for (const key of Object.getOwnPropertyNames(value)) {
        add((value as unknown as Record<string, unknown>)[key]);
      }
    }
  }

  add(root);
  return values;
}

export function expectThrownErrorLeakFree(
  err: unknown,
  expectations: ConsoleLeakExpectations,
): void {
  for (const probe of collectLeakProbeValues(err)) {
    assertArgLeakFree(probe, expectations);
  }
}

export function expectConsoleCallsLeakFree(
  spies: Array<ReturnType<typeof vi.spyOn>>,
  expectations: ConsoleLeakExpectations,
): void {
  for (const spy of spies) {
    for (const call of spy.mock.calls) {
      for (const arg of call as unknown[]) {
        assertArgLeakFree(arg, expectations);
      }
    }
  }
}

const CONSOLE_LEVELS = ["error", "warn", "info", "log", "debug"] as const;

export function spyAllConsoleLevels(): Array<ReturnType<typeof vi.spyOn>> {
  return CONSOLE_LEVELS.map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
}

export function restoreConsoleSpies(spies: Array<ReturnType<typeof vi.spyOn>>): void {
  for (const spy of spies) {
    spy.mockRestore();
  }
}
