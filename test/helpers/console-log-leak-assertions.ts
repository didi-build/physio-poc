import { expect, vi } from "vitest";

export function flattenConsoleCallArgs(call: unknown[]): string {
  return call
    .map((arg) =>
      arg instanceof Error ? `${arg.message} ${arg.stack ?? ""}` : String(arg),
    )
    .join(" ");
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

export function expectConsoleCallsLeakFree(
  spies: Array<ReturnType<typeof vi.spyOn>>,
  expectations: ConsoleLeakExpectations,
): void {
  for (const spy of spies) {
    for (const call of spy.mock.calls) {
      const logged = flattenConsoleCallArgs(call as unknown[]);
      if (expectations.apiKey) {
        expect(logged).not.toContain(expectations.apiKey);
      }
      if (expectations.jsonBody) {
        expect(logged).not.toContain(expectations.jsonBody);
      }
      if (expectations.note) {
        expect(logged).not.toContain(expectations.note);
        expect(logged).not.toContain(jsonEscapedNoteFragment(expectations.note));
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
