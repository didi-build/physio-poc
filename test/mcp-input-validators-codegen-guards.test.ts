import { describe, expect, it } from "vitest";
import { postProcessStandaloneSource } from "../scripts/lib/mcp-input-validators-codegen.mjs";

describe("MCP input validator codegen postProcessStandaloneSource guards", () => {
  it("rejects standalone source that still references formats0", () => {
    expect(() => postProcessStandaloneSource("const formats0 = {};")).toThrow(
      /Unexpected date format in generated validators/,
    );
  });

  it("rejects standalone source that still contains require(", () => {
    expect(() =>
      postProcessStandaloneSource('const x = require("ajv/dist/runtime/ucs2length");'),
    ).toThrow(/Generated validators still contain require\(\)/);
  });
});
