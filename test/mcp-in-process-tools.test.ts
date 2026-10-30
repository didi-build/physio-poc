import { describe, expect, it } from "vitest";
import { SEARCH_APPROVED_EXERCISES_TOOL_NAME } from "../src/mcp-connector/index.js";
import { withMcpClient } from "./mcp-server-test-utils.js";

describe("MCP tools in-process (FakeAuthPort smoke)", () => {
  it("calls search_approved_exercises through handleRequest without workerd", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: "calf stretch" },
      });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { summary?: string }).summary).toMatch(
        /^Example response:/,
      );
    });
  });
});
