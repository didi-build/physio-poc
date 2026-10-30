import type {
  JsonSchemaType,
  JsonSchemaValidator,
  jsonSchemaValidator,
} from "@modelcontextprotocol/sdk/validation";

/**
 * Avoids the MCP SDK default AjvJsonSchemaValidator (code generation via new Function).
 * V1 read-only stub does not support elicitation; tool inputs use validatePhysioMcpToolInput.
 */
export class PhysioMcpWorkersSafeJsonSchemaValidator implements jsonSchemaValidator {
  getValidator<T>(schema: JsonSchemaType): JsonSchemaValidator<T> {
    void schema;
    return (input: unknown) => ({
      valid: true,
      data: input as T,
      errorMessage: undefined,
    });
  }
}
