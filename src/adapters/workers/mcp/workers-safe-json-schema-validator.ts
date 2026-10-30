import type {
  JsonSchemaType,
  JsonSchemaValidator,
  jsonSchemaValidator,
} from "@modelcontextprotocol/sdk/validation";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  PHYSIO_MCP_TOOLS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
} from "../../../mcp-connector/index.js";
import type { StandaloneValidateFunction } from "../../../services/mcp/generated/input-validators.js";
import {
  get_program_builder_link,
  get_program_share_link_or_pdf,
  search_approved_exercises,
  search_routines,
} from "../../../services/mcp/generated/input-validators.js";

const STANDALONE_BY_SCHEMA_ID: Record<string, StandaloneValidateFunction> = {
  "physio-mcp-input/search_approved_exercises": search_approved_exercises,
  "physio-mcp-input/search_routines": search_routines,
  "physio-mcp-input/get_program_builder_link": get_program_builder_link,
  "physio-mcp-input/get_program_share_link_or_pdf": get_program_share_link_or_pdf,
};

const STANDALONE_BY_TOOL_NAME: Record<string, StandaloneValidateFunction> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: search_approved_exercises,
  [SEARCH_ROUTINES_TOOL_NAME]: search_routines,
  [GET_PROGRAM_BUILDER_LINK_TOOL_NAME]: get_program_builder_link,
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: get_program_share_link_or_pdf,
};

function stableSchemaKey(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSchemaKey(entry)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSchemaKey(obj[key])}`)
    .join(",")}}`;
}

function buildGoldenSchemaKeys(): Map<string, StandaloneValidateFunction> {
  const map = new Map<string, StandaloneValidateFunction>();
  for (const tool of PHYSIO_MCP_TOOLS) {
    map.set(
      stableSchemaKey(tool.inputSchema as JsonSchemaType),
      STANDALONE_BY_TOOL_NAME[tool.name],
    );
  }
  return map;
}

const GOLDEN_INPUT_SCHEMA_KEYS = buildGoldenSchemaKeys();

function resolveStandaloneValidator(
  schema: JsonSchemaType,
): StandaloneValidateFunction | undefined {
  if (typeof schema.$id === "string") {
    const byId = STANDALONE_BY_SCHEMA_ID[schema.$id];
    if (byId) {
      return byId;
    }
  }
  return GOLDEN_INPUT_SCHEMA_KEYS.get(stableSchemaKey(schema));
}

function formatStandaloneErrors(validate: StandaloneValidateFunction): string {
  const errors = validate.errors;
  if (!errors || errors.length === 0) {
    return "Invalid value.";
  }
  return errors.map((entry) => entry.message ?? "Invalid value.").join("; ");
}

function wrapStandaloneValidator(
  validate: StandaloneValidateFunction,
): JsonSchemaValidator<unknown> {
  return (input: unknown) => {
    if (validate(input)) {
      return {
        valid: true,
        data: input,
        errorMessage: undefined,
      };
    }
    return {
      valid: false,
      data: undefined,
      errorMessage: formatStandaloneErrors(validate),
    };
  };
}

/**
 * MCP SDK jsonSchemaValidator that uses precompiled standalone validators only.
 * Never calls Ajv compile (new Function) or eval.
 */
export class PhysioMcpWorkersSafeJsonSchemaValidator implements jsonSchemaValidator {
  private readonly cache = new WeakMap<JsonSchemaType, JsonSchemaValidator<unknown>>();

  getValidator<T>(schema: JsonSchemaType): JsonSchemaValidator<T> {
    let cached = this.cache.get(schema);
    if (!cached) {
      const standalone = resolveStandaloneValidator(schema);
      cached = standalone
        ? wrapStandaloneValidator(standalone)
        : () => ({
            valid: false,
            data: undefined,
            errorMessage:
              "Unsupported JSON Schema for Workers-safe validation in physio-poc.",
          });
      this.cache.set(schema, cached);
    }
    return cached as JsonSchemaValidator<T>;
  }
}
