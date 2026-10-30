import { describe, expect, it } from "vitest";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv-provider.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { createPhysioMcpServer } from "../src/adapters/workers/mcp/create-physio-mcp-server.js";
import { PhysioMcpWorkersSafeJsonSchemaValidator } from "../src/adapters/workers/mcp/workers-safe-json-schema-validator.js";

describe("Physio MCP Workers-safe jsonSchemaValidator", () => {
  it("wires PhysioMcpWorkersSafeJsonSchemaValidator instead of the SDK Ajv default", () => {
    const server = createPhysioMcpServer(MCP_TEST_CONFIG);
    const internal = server as unknown as {
      _jsonSchemaValidator: PhysioMcpWorkersSafeJsonSchemaValidator;
    };
    expect(internal._jsonSchemaValidator).toBeInstanceOf(
      PhysioMcpWorkersSafeJsonSchemaValidator,
    );
    expect(internal._jsonSchemaValidator).not.toBeInstanceOf(AjvJsonSchemaValidator);
  });

  it("getValidator never reaches new Function on the Workers-safe provider", () => {
    const originalFunction = globalThis.Function;
    let sawDynamicFunction = false;
    globalThis.Function = function (...args: string[]) {
      sawDynamicFunction = true;
      return originalFunction(...args);
    } as typeof Function;
    try {
      const provider = new PhysioMcpWorkersSafeJsonSchemaValidator();
      const validate = provider.getValidator({
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string", minLength: 1, maxLength: 100 } },
        $id: "physio-mcp-input/search_approved_exercises",
      });
      expect(validate({ query: "ok" }).valid).toBe(true);
      expect(validate({ query: "" }).valid).toBe(false);
      expect(sawDynamicFunction).toBe(false);
    } finally {
      globalThis.Function = originalFunction;
    }
  });

  it("uses code generation when the SDK default AjvJsonSchemaValidator compiles", () => {
    const originalFunction = globalThis.Function;
    let sawDynamicFunction = false;
    globalThis.Function = function (...args: string[]) {
      sawDynamicFunction = true;
      return originalFunction(...args);
    } as typeof Function;
    try {
      const ajvProvider = new AjvJsonSchemaValidator();
      const validate = ajvProvider.getValidator({
        type: "object",
        properties: { note: { type: "string" } },
      });
      validate({ note: "ok" });
      expect(sawDynamicFunction).toBe(true);
    } finally {
      globalThis.Function = originalFunction;
    }
  });
});
