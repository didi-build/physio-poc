import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  buildWebAppExerciseSearchUrl,
  normalizeWebAppBaseUrl,
  type PhysioMcpToolName,
} from "../../mcp-connector/index.js";
import type { PhysioServerConfig } from "../../http/config.js";
import {
  PhysioMcpToolInputError,
  validatePhysioMcpToolInput,
} from "./validate-tool-input.js";

const EXAMPLE_LABEL = "Example response";

function exampleSummary(detail: string): string {
  return `${EXAMPLE_LABEL}: ${detail}`;
}

function manageUrl(config: PhysioServerConfig, path: string): string {
  return `${normalizeWebAppBaseUrl(config.webAppBaseUrl)}${path}`;
}

export async function invokePhysioMcpStubTool(
  toolName: string,
  args: unknown,
  config: PhysioServerConfig,
): Promise<Record<string, unknown>> {
  const input = validatePhysioMcpToolInput(toolName, args);
  const name = toolName as PhysioMcpToolName;

  switch (name) {
    case SEARCH_APPROVED_EXERCISES_TOOL_NAME:
      return stubSearchApprovedExercises(input, config);
    case SEARCH_ROUTINES_TOOL_NAME:
      return stubSearchRoutines(input, config);
    case BUILD_OR_EDIT_PROGRAM_TOOL_NAME:
      return stubBuildOrEditProgram(input, config);
    case GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME:
      return stubGetProgramShareLinkOrPdf(input, config);
    default:
      throw new PhysioMcpToolInputError(`Unknown tool: ${toolName}`);
  }
}

function stubSearchApprovedExercises(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const query = String(input.query ?? "");
  const exercises = [
    {
      exercise_version_id: "ex-v-stub-001",
      exercise_name: "Standing calf stretch",
      category: "Stretching",
      body_regions: ["Lower leg"],
      allowed_prescription_types: ["stretching", "isometric"],
    },
    {
      exercise_version_id: "ex-v-stub-002",
      exercise_name: "Seated hamstring stretch",
      category: "Stretching",
      body_regions: ["Posterior thigh"],
      allowed_prescription_types: ["stretching"],
    },
  ];

  return {
    summary: exampleSummary(`Approved exercises matching "${query}" (not stored).`),
    share_link: "",
    manage_url: manageUrl(config, "/exercises"),
    exercises,
    search_link: buildWebAppExerciseSearchUrl(config.webAppBaseUrl, query),
  };
}

function stubSearchRoutines(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const query = String(input.query ?? "");
  return {
    summary: exampleSummary(`Routines matching "${query}" (not stored).`),
    share_link: "",
    manage_url: manageUrl(config, "/routines"),
    routines: [
      {
        routine_id: "rtn-stub-knee",
        routine_name: "Knee mobility starter",
        routine_version: 1,
        exercise_count: 4,
        source: "community",
      },
    ],
  };
}

function stubBuildOrEditProgram(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const programCode =
    typeof input.program_code === "string" && input.program_code.trim().length > 0
      ? input.program_code.trim()
      : "PRG-STUB01";
  const programTitle =
    typeof input.program_title === "string" && input.program_title.trim().length > 0
      ? input.program_title.trim()
      : "Sample balance plan";

  const rowsInput = Array.isArray(input.rows) ? input.rows : [];
  const rows = rowsInput.map((row, index) => {
    const record = row as Record<string, unknown>;
    const exerciseName =
      typeof record.exercise_name === "string" ? record.exercise_name : "Heel slides";
    return {
      exercise_version_id:
        typeof record.exercise_version_id === "string"
          ? record.exercise_version_id
          : `ex-v-stub-row-${index + 1}`,
      exercise_name: exerciseName,
      prescription_type:
        typeof record.prescription_type === "string"
          ? record.prescription_type
          : "stretching",
      params:
        record.params && typeof record.params === "object"
          ? record.params
          : { sets: 3, reps: 10 },
    };
  });

  if (rows.length === 0) {
    rows.push({
      exercise_version_id: "ex-v-stub-default",
      exercise_name: "Ankle circles",
      prescription_type: "stretching",
      params: { sets: 2, reps: 12 },
    });
  }

  return {
    summary: exampleSummary(
      `Program ${programCode} saved in memory only; nothing persisted.`,
    ),
    share_link: "",
    manage_url: manageUrl(config, `/programs/${programCode}`),
    program_code: programCode,
    program_title: programTitle,
    rows,
  };
}

function stubGetProgramShareLinkOrPdf(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const programCode =
    typeof input.program_code === "string" && input.program_code.trim().length > 0
      ? input.program_code.trim()
      : "PRG-STUB01";
  const publish = input.publish === true;

  if (publish) {
    return {
      summary: exampleSummary("Published stub program with default expiry."),
      share_link: manageUrl(config, "/l/stub-share"),
      pdf_url: `${manageUrl(config, "/l/stub-share")}.pdf`,
      manage_url: manageUrl(config, `/programs/${programCode}`),
      expires_at: "2027-10-29T12:00:00Z",
      draft: null,
      published: { version: 2, updated_at: "2026-10-29T15:00:00Z" },
      program_code: programCode,
    };
  }

  return {
    summary: exampleSummary("Draft and published snapshots (stub, not stored)."),
    share_link: manageUrl(config, "/l/stub-share"),
    pdf_url: `${manageUrl(config, "/l/stub-share")}.pdf`,
    manage_url: manageUrl(config, `/programs/${programCode}`),
    expires_at: "2027-10-29T12:00:00Z",
    draft: { version: 1, updated_at: "2026-10-29T12:00:00Z" },
    published: { version: 2, updated_at: "2026-10-28T12:00:00Z" },
    program_code: programCode,
  };
}
