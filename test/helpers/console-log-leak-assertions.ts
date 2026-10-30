import { inspect } from "node:util";
import { expect, vi } from "vitest";

export function inspectValue(value: unknown): string {
  return inspect(value, { depth: null });
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

export function assertLeakFreeText(
  text: string,
  expectations: ConsoleLeakExpectations,
): void {
  if (expectations.apiKey) {
    expect(text).not.toContain(expectations.apiKey);
  }
  if (expectations.jsonBody) {
    expect(text).not.toContain(expectations.jsonBody);
  }
  if (expectations.note) {
    expect(text).not.toContain(expectations.note);
    expect(text).not.toContain(jsonEscapedNoteFragment(expectations.note));
  }
}

export function assertArgLeakFree(
  arg: unknown,
  expectations: ConsoleLeakExpectations,
): void {
  assertLeakFreeText(rawFormOfArg(arg), expectations);
  assertLeakFreeText(inspectValue(arg), expectations);
}

export function expectThrownErrorLeakFree(
  err: unknown,
  expectations: ConsoleLeakExpectations,
): void {
  assertArgLeakFree(err, expectations);
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
