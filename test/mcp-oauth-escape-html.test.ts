import { describe, expect, it } from "vitest";
import { jsonForHtmlScript } from "../src/auth/mcp-oauth/escape-html.js";

describe("jsonForHtmlScript (DIDI-1126)", () => {
  it("escapes less-than as \\u003c in JSON for inline scripts", () => {
    expect(jsonForHtmlScript("<close-tag")).toBe('"\\u003cclose-tag"');
    expect(jsonForHtmlScript("a<b")).toBe('"a\\u003cb"');
  });
});
