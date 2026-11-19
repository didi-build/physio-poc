import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWriteSchemaOmissionsMarkdown } from "../src/mcp-connector/write-schema-omissions.js";

const DOC_PATH = join(
  process.cwd(),
  "docs/mcp-connector/write-schema-omitted-descriptions.md",
);

describe("Write schema omissions doc", () => {
  it("matches the generator script output", () => {
    const committed = readFileSync(DOC_PATH, "utf8");
    const { markdown } = buildWriteSchemaOmissionsMarkdown();
    expect(markdown).toBe(committed);
  });
});
