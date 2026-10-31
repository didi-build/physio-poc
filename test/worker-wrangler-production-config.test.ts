import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  WORKER_WRANGLER_COMPATIBILITY_DATE,
  WORKER_WRANGLER_COMPATIBILITY_FLAGS,
} from "../src/adapters/workers/create-app-dependencies.js";

const WRANGLER_PATH = join(import.meta.dirname, "..", "wrangler.jsonc");

function parseWranglerJsonc(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => printParseErrorCode(entry.error)).join(", "));
  }
  return parsed as Record<string, unknown>;
}

describe("Worker wrangler production config (DIDI-1153)", () => {
  it("pins compatibility_date and compatibility_flags for production Worker auth", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    expect(parsed.compatibility_date).toBe(WORKER_WRANGLER_COMPATIBILITY_DATE);
    expect(parsed.compatibility_date).toBe("2025-10-29");
    expect(parsed.compatibility_flags).toEqual([
      ...WORKER_WRANGLER_COMPATIBILITY_FLAGS,
    ]);
    expect(parsed.compatibility_flags).toEqual([
      "nodejs_compat",
      "nodejs_compat_do_not_populate_process_env",
    ]);
  });

  it("rejects a downgraded compatibility_date in wrangler.jsonc (mutation X18)", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    expect(parsed.compatibility_date).toBe("2025-10-29");
    expect(parsed.compatibility_date).toBe(WORKER_WRANGLER_COMPATIBILITY_DATE);
  });
});
