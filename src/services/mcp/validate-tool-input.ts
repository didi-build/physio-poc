import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  PHYSIO_MCP_TOOL_NAMES,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  type PhysioMcpToolName,
} from "../../mcp-connector/index.js";
import { DATE_FORMAT_FIELD_PATHS } from "./generated/input-validator-meta.js";
import type { StandaloneValidateFunction } from "./generated/input-validators.js";
import {
  get_program_builder_link,
  get_program_share_link_or_pdf,
  search_approved_exercises,
  search_routines,
} from "./generated/input-validators.js";
import { validateFreeTextForPatientDetails } from "../../mcp-connector/index.js";

export class PhysioMcpToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhysioMcpToolInputError";
  }
}

const validators: Record<PhysioMcpToolName, StandaloneValidateFunction> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: search_approved_exercises,
  [SEARCH_ROUTINES_TOOL_NAME]: search_routines,
  [GET_PROGRAM_BUILDER_LINK_TOOL_NAME]: get_program_builder_link,
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: get_program_share_link_or_pdf,
};

function formatStandaloneErrors(validate: StandaloneValidateFunction): string {
  const errors = validate.errors;
  if (!errors || errors.length === 0) {
    return "Invalid tool arguments.";
  }
  return errors.map((entry) => entry.message ?? "Invalid tool arguments.").join("; ");
}

function assertGetProgramLookup(args: Record<string, unknown>): void {
  const code = args.program_code;
  const title = args.program_title;
  const hasCode = typeof code === "string" && code.trim().length > 0;
  const hasTitle = typeof title === "string" && title.trim().length > 0;
  if (!hasCode && !hasTitle) {
    throw new PhysioMcpToolInputError(
      "Provide program_code or program_title to look up a program.",
    );
  }
}

function validateAllStringValues(value: unknown, path = ""): void {
  if (typeof value === "string") {
    const skipDateOfBirthHeuristic = (
      DATE_FORMAT_FIELD_PATHS as ReadonlySet<string>
    ).has(path);
    const result = validateFreeTextForPatientDetails(value, {
      skipDateOfBirthHeuristic,
    });
    if (!result.ok) {
      throw new PhysioMcpToolInputError(result.message);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateAllStringValues(item, path);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nestedPath = path ? `${path}.${key}` : key;
      validateAllStringValues(nested, nestedPath);
    }
  }
}

export function validatePhysioMcpToolInput(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  if (!PHYSIO_MCP_TOOL_NAMES.includes(toolName as PhysioMcpToolName)) {
    throw new PhysioMcpToolInputError(`Unknown tool: ${toolName}`);
  }
  const name = toolName as PhysioMcpToolName;
  const record =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  if (name === GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME) {
    assertGetProgramLookup(record);
  }

  if (typeof record.from_routine_id === "string") {
    record.from_routine_id = record.from_routine_id.trim();
  }
  if (typeof record.program_code === "string") {
    record.program_code = record.program_code.trim();
  }

  const validate = validators[name];
  if (!validate(record)) {
    throw new PhysioMcpToolInputError(formatStandaloneErrors(validate));
  }

  validateAllStringValues(record);

  return record;
}
