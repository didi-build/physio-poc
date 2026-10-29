import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  getPhysioMcpTool,
  PHYSIO_MCP_TOOL_NAMES,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  validateFreeTextForPatientDetails,
  type JsonSchema,
  type PhysioMcpToolName,
} from "../../mcp-connector/index.js";

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

const validators = new Map<PhysioMcpToolName, ReturnType<typeof ajv.compile>>();

for (const name of PHYSIO_MCP_TOOL_NAMES) {
  const tool = getPhysioMcpTool(name);
  if (!tool) {
    throw new Error(`Missing tool definition for ${name}`);
  }
  validators.set(name, ajv.compile(tool.inputSchema as JsonSchema));
}

export class PhysioMcpToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhysioMcpToolInputError";
  }
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

function collectFreeTextFields(
  toolName: PhysioMcpToolName,
  args: Record<string, unknown>,
): string[] {
  const texts: string[] = [];
  if (toolName === SEARCH_APPROVED_EXERCISES_TOOL_NAME) {
    if (typeof args.query === "string") texts.push(args.query);
  }
  if (toolName === SEARCH_ROUTINES_TOOL_NAME) {
    if (typeof args.query === "string") texts.push(args.query);
  }
  if (toolName === BUILD_OR_EDIT_PROGRAM_TOOL_NAME) {
    if (typeof args.program_title === "string") texts.push(args.program_title);
    if (Array.isArray(args.rows)) {
      for (const row of args.rows) {
        if (row && typeof row === "object") {
          const record = row as Record<string, unknown>;
          if (typeof record.row_notes === "string") texts.push(record.row_notes);
          if (typeof record.exercise_name === "string")
            texts.push(record.exercise_name);
        }
      }
    }
  }
  if (toolName === GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME) {
    if (typeof args.program_title === "string") texts.push(args.program_title);
  }
  return texts;
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

  const validate = validators.get(name);
  if (!validate) {
    throw new PhysioMcpToolInputError(`Missing validator for ${name}`);
  }
  if (!validate(record)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    throw new PhysioMcpToolInputError(
      detail.length > 0 ? detail : "Invalid tool arguments.",
    );
  }

  for (const text of collectFreeTextFields(name, record)) {
    const result = validateFreeTextForPatientDetails(text);
    if (!result.ok) {
      throw new PhysioMcpToolInputError(result.message);
    }
  }

  return record;
}
