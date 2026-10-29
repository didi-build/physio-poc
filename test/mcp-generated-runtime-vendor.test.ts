import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAjvFormatsDateVendorSource,
  buildAjvUcs2lengthVendorSource,
} from "../scripts/generate-mcp-input-validators.mjs";

describe("MCP validator runtime vendor files", () => {
  it("matches ajv ucs2length upstream for the pinned package", () => {
    const committed = readFileSync(
      join(process.cwd(), "src/services/mcp/generated/runtime/ajv-ucs2length.js"),
      "utf8",
    );
    expect(committed).toBe(buildAjvUcs2lengthVendorSource());
  });

  it("matches ajv-formats date helpers upstream for the pinned package", () => {
    const committed = readFileSync(
      join(process.cwd(), "src/services/mcp/generated/runtime/ajv-formats-date.js"),
      "utf8",
    );
    expect(committed).toBe(buildAjvFormatsDateVendorSource());
  });
});
