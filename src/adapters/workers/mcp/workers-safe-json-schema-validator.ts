import type {
  JsonSchemaType,
  JsonSchemaValidator,
  jsonSchemaValidator,
} from "@modelcontextprotocol/sdk/validation";

/** Developer-facing only; thrown if the MCP SDK invokes jsonSchemaValidator (elicitation). */
export const PHYSIO_MCP_SDK_JSON_SCHEMA_VALIDATION_ERROR =
  "physio-poc: SDK JSON Schema validation is not supported in the Worker";

/**
 * Avoids the MCP SDK default AjvJsonSchemaValidator (code generation via new Function).
 * Fails closed by throwing if the SDK ever calls the returned validator (V1 has no elicitation).
 * Tool inputs use validatePhysioMcpToolInput standalone validators instead.
 */
export class PhysioMcpWorkersSafeJsonSchemaValidator implements jsonSchemaValidator {
  getValidator<T>(schema: JsonSchemaType): JsonSchemaValidator<T> {
    void schema;
    return () => {
      throw new Error(PHYSIO_MCP_SDK_JSON_SCHEMA_VALIDATION_ERROR);
    };
  }
}
