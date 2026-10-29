import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("MCP input validator codegen drift", () => {
  it("matches committed standalone validators generated from the golden fixture", () => {
    execFileSync(
      process.execPath,
      ["scripts/generate-mcp-input-validators.mjs", "--check"],
      {
        cwd: process.cwd(),
        stdio: "pipe",
      },
    );
  });
});
