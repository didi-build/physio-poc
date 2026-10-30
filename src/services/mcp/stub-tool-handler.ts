import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  buildWebAppExerciseSearchUrl,
  inferGetProgramDisplayState,
  normalizeWebAppBaseUrl,
  type PhysioMcpToolName,
} from "../../mcp-connector/index.js";
import type { PhysioServerConfig } from "../../http/config.js";
import {
  PhysioMcpToolInputError,
  validatePhysioMcpToolInput,
} from "./validate-tool-input.js";

/** Fixed query that returns zero exercises plus search_link (stub ruling B). */
export const STUB_SEARCH_NO_MATCH_QUERY = "zzzz-stub-no-approved-match";

/** Fixed program code that returns draft-only share state in the stub. */
export const STUB_DRAFT_ONLY_PROGRAM_CODE = "PRG-STUBDRAFT";

const EXAMPLE_LABEL = "Example response";

function exampleSummary(detail: string): string {
  return `${EXAMPLE_LABEL}: ${detail}`;
}

function appUrl(
  config: PhysioServerConfig,
  routeName: Parameters<typeof buildPhysioAppUrl>[1],
  options?: Parameters<typeof buildPhysioAppUrl>[2],
): string {
  return buildPhysioAppUrl(config.webAppBaseUrl, routeName, options);
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
    case GET_PROGRAM_BUILDER_LINK_TOOL_NAME:
      return stubGetProgramBuilderLink(input, config);
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
  const searchLink = buildWebAppExerciseSearchUrl(config.webAppBaseUrl, query);

  if (query === STUB_SEARCH_NO_MATCH_QUERY) {
    return {
      summary: exampleSummary(`No approved exercises matched "${query}" (not stored).`),
      share_link: "",
      manage_url: appUrl(config, "exercises"),
      exercises: [],
      search_link: searchLink,
    };
  }

  return {
    summary: exampleSummary(`Approved exercises matching "${query}" (not stored).`),
    share_link: "",
    manage_url: appUrl(config, "exercises"),
    exercises: [
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
    ],
    search_link: searchLink,
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
    manage_url: appUrl(config, "routines"),
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

function stubGetProgramBuilderLink(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const builderLink = buildProgramBuilderLink(config.webAppBaseUrl, {
    program_code:
      typeof input.program_code === "string" ? input.program_code : undefined,
    from_routine_id:
      typeof input.from_routine_id === "string" ? input.from_routine_id : undefined,
  });

  const programCode =
    typeof input.program_code === "string" && input.program_code.trim().length > 0
      ? input.program_code.trim()
      : undefined;
  const routineId =
    typeof input.from_routine_id === "string" && input.from_routine_id.trim().length > 0
      ? input.from_routine_id.trim()
      : undefined;

  const output: Record<string, unknown> = {
    summary: exampleSummary("Open the program builder in the web app (not stored)."),
    share_link: "",
    builder_link: builderLink,
    manage_url: programCode
      ? appUrl(config, "programBuilder", { routeParams: { programCode } })
      : appUrl(config, "programNew"),
  };
  if (programCode) {
    output.program_code = programCode;
  }
  if (routineId) {
    output.from_routine_id = routineId;
  }
  return output;
}

function stubGetProgramShareLinkOrPdf(
  input: Record<string, unknown>,
  config: PhysioServerConfig,
): Record<string, unknown> {
  const programCode =
    typeof input.program_code === "string" && input.program_code.trim().length > 0
      ? input.program_code.trim()
      : "PRG-STUB01";

  const draftOnly = programCode === STUB_DRAFT_ONLY_PROGRAM_CODE;
  const draft = draftOnly
    ? { version: 1, updated_at: "2026-10-29T12:00:00Z" }
    : { version: 1, updated_at: "2026-10-29T12:00:00Z" };
  const published = draftOnly
    ? null
    : { version: 2, updated_at: "2026-10-28T12:00:00Z" };
  const state = inferGetProgramDisplayState(draft, published);

  const manageLink = appUrl(config, "programShare", {
    routeParams: { programCode },
  });
  const publishLink = appUrl(config, "programPublish", {
    routeParams: { programCode },
  });
  const manageUrl = appUrl(config, "programBuilder", {
    routeParams: { programCode },
  });
  const shareUrl = `${normalizeWebAppBaseUrl(config.webAppBaseUrl)}/l/stub-share`;

  if (state === "draft_only") {
    return {
      summary: exampleSummary("Draft only; open the publish page in the web app."),
      share_link: "",
      pdf_url: "",
      manage_url: manageUrl,
      publish_link: publishLink,
      manage_link: manageLink,
      draft,
      published: null,
      program_code: programCode,
    };
  }

  if (state === "published_only") {
    return {
      summary: exampleSummary("Published program on file (stub, not stored)."),
      share_link: shareUrl,
      pdf_url: `${shareUrl}.pdf`,
      manage_url: manageUrl,
      publish_link: "",
      manage_link: manageLink,
      expires_at: "2027-10-29T12:00:00Z",
      draft: null,
      published,
      program_code: programCode,
    };
  }

  return {
    summary: exampleSummary(
      "Published link live; newer draft not published (stub, not stored).",
    ),
    share_link: shareUrl,
    pdf_url: `${shareUrl}.pdf`,
    manage_url: manageUrl,
    publish_link: publishLink,
    manage_link: manageLink,
    expires_at: "2027-10-29T12:00:00Z",
    draft,
    published,
    program_code: programCode,
  };
}
