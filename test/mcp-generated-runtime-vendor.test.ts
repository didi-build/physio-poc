import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAjvUcs2lengthVendorSource } from "../scripts/lib/mcp-input-validators-codegen.mjs";

describe("MCP validator runtime vendor files", () => {
  it("matches ajv ucs2length upstream for the pinned package", () => {
    const committed = readFileSync(
      join(process.cwd(), "src/services/mcp/generated/runtime/ajv-ucs2length.js"),
      "utf8",
    );
    expect(committed).toBe(buildAjvUcs2lengthVendorSource());
  });
});
