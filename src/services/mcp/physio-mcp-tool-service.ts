import type { PhysioServerConfig } from "../../http/config.js";
import {
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
} from "../../mcp-connector/index.js";
import type { ApprovedExerciseSummary } from "../exercise-library/types.js";
import { ExerciseLibraryService } from "../exercise-library/exercise-library-service.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../programs/program-builder-service.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
} from "../programs/program-publish-service.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  approvedExerciseSearchSummary,
  foundProgramByCodeSummary,
  programShareSummary,
} from "./connector-copy.js";
import { stubGetProgramBuilderLink, stubSearchRoutines } from "./stub-tool-handler.js";
import { PhysioMcpToolInputError } from "./validate-tool-input.js";

export type PhysioMcpToolInvocation = {
  readonly practitionerId: string;
  readonly config: PhysioServerConfig;
  readonly sql: SqlStoragePort;
};

function mapExerciseForMcp(exercise: ApprovedExerciseSummary): Record<string, unknown> {
  return {
    exercise_version_id: exercise.exercise_version_id,
    exercise_name: exercise.exercise_name,
    category: exercise.category,
    body_regions: exercise.body_regions,
    allowed_prescription_types: exercise.allowed_prescription_types,
  };
}

function appUrl(
  config: PhysioServerConfig,
  routeName: Parameters<typeof buildPhysioAppUrl>[1],
  options?: Parameters<typeof buildPhysioAppUrl>[2],
): string {
  return buildPhysioAppUrl(config.webAppBaseUrl, routeName, options);
}

export class PhysioMcpToolService {
  constructor(private readonly invocation: PhysioMcpToolInvocation) {}

  private get practitionerId(): string {
    return this.invocation.practitionerId;
  }

  private get config(): PhysioServerConfig {
    return this.invocation.config;
  }

  private get sql(): SqlStoragePort {
    return this.invocation.sql;
  }

  async searchApprovedExercises(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const library = new ExerciseLibraryService(this.sql, this.config);
    const query = String(input.query ?? "");
    const result = await library.searchApprovedExercises({
      practitionerId: this.practitionerId,
      query,
      category:
        input.category === "Stretching" || input.category === "Strengthening"
          ? input.category
          : undefined,
      bodyRegion: typeof input.body_region === "string" ? input.body_region : undefined,
      prescriptionType:
        input.prescription_type === "stretching" ||
        input.prescription_type === "isometric" ||
        input.prescription_type === "concentric" ||
        input.prescription_type === "eccentric"
          ? input.prescription_type
          : undefined,
      limit: typeof input.limit === "number" ? input.limit : undefined,
      cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    });

    const output: Record<string, unknown> = {
      summary: approvedExerciseSearchSummary(result.exercises.length),
      share_link: "",
      manage_url: appUrl(this.config, "exercises"),
      exercises: result.exercises.map(mapExerciseForMcp),
    };
    if (result.next_cursor) {
      output.next_cursor = result.next_cursor;
    }
    if (result.search_link) {
      output.search_link = result.search_link;
    }
    return output;
  }

  async searchRoutines(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return stubSearchRoutines(input, this.config);
  }

  async getProgramBuilderLink(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const programCode =
      typeof input.program_code === "string" && input.program_code.length > 0
        ? input.program_code
        : undefined;
    if (!programCode) {
      return stubGetProgramBuilderLink(input, this.config);
    }

    const builder = new ProgramBuilderService(this.sql);
    let view;
    try {
      view = await builder.getProgramByCode(this.practitionerId, programCode);
    } catch (err) {
      if (
        err instanceof ProgramBuilderServiceError &&
        err.code === "program_not_found"
      ) {
        throw new PhysioMcpToolInputError("Program not found");
      }
      throw err;
    }
    const builderLink = buildProgramBuilderLink(this.config.webAppBaseUrl, {
      program_code: view.code,
    });

    return {
      summary: foundProgramByCodeSummary(view.code, view.name, view.exercise_count),
      share_link: "",
      builder_link: builderLink,
      manage_url: appUrl(this.config, "programBuilder", {
        routeParams: { programCode: view.code },
      }),
      program_code: view.code,
    };
  }

  async getProgramShareLinkOrPdf(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const programCode =
      typeof input.program_code === "string" && input.program_code.length > 0
        ? input.program_code
        : undefined;
    const programTitle =
      typeof input.program_title === "string" && input.program_title.length > 0
        ? input.program_title
        : undefined;

    const builder = new ProgramBuilderService(this.sql);
    const publish = new ProgramPublishService(this.sql, this.config.webAppBaseUrl);
    let programId: string;
    let programName: string | null = null;

    if (programCode) {
      try {
        const view = await builder.getProgramByCode(this.practitionerId, programCode);
        programId = view.program_id;
        programName = view.name;
      } catch (err) {
        if (
          err instanceof ProgramBuilderServiceError &&
          err.code === "program_not_found"
        ) {
          throw new PhysioMcpToolInputError("Program not found");
        }
        throw err;
      }
    } else if (programTitle) {
      const titleMatches = await builder.listOwnedProgramsByExactTitle(
        this.practitionerId,
        programTitle,
      );
      if (titleMatches.length === 0) {
        throw new PhysioMcpToolInputError("Program not found");
      }
      if (titleMatches.length > 1) {
        return {
          summary: `Multiple programs match "${programTitle}". Provide program_code.`,
          share_link: "",
          pdf_url: "",
          manage_url: "",
          publish_link: "",
          manage_link: "",
          draft: null,
          published: null,
          ambiguous_program_matches: titleMatches.map((row) => ({
            program_code: row.code,
            program_title: row.name ?? "",
            updated_at: row.draft_updated_at,
          })),
        };
      }
      programId = titleMatches[0]!.program_id;
      programName = titleMatches[0]!.name;
    } else {
      throw new PhysioMcpToolInputError("Program not found");
    }

    let connector: Awaited<ReturnType<ProgramPublishService["getShareConnectorView"]>>;
    try {
      connector = await publish.getShareConnectorView(this.practitionerId, programId);
    } catch (err) {
      if (
        err instanceof ProgramPublishServiceError &&
        err.code === "program_not_found"
      ) {
        throw new PhysioMcpToolInputError("Program not found");
      }
      throw err;
    }

    const displayState = connector.display_state;
    const manageUrl = appUrl(this.config, "programBuilder", {
      routeParams: { programCode: connector.program_code },
    });
    const manageLink = appUrl(this.config, "programShare", {
      routeParams: { programCode: connector.program_code },
    });
    const publishLink =
      displayState === "draft_only" || displayState === "published_with_draft_changes"
        ? appUrl(this.config, "programPublish", {
            routeParams: { programCode: connector.program_code },
          })
        : "";

    const shareLink = connector.open_share_link ? connector.share_link : "";
    const pdfUrl = shareLink.length > 0 ? `${shareLink}.pdf` : "";

    const output: Record<string, unknown> = {
      summary: programShareSummary({
        displayState,
        programCode: connector.program_code,
        programTitle: programName,
        openShareLink: connector.open_share_link,
      }),
      share_link: shareLink,
      pdf_url: pdfUrl,
      manage_url: manageUrl,
      publish_link: publishLink,
      manage_link: manageLink,
      draft: connector.draft,
      published: connector.published,
      program_code: connector.program_code,
    };
    if (programName) {
      output.program_title = programName;
    }
    if (connector.open_share_link && connector.expires_at) {
      output.expires_at = connector.expires_at;
    }
    return output;
  }

  async invokeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (toolName) {
      case SEARCH_APPROVED_EXERCISES_TOOL_NAME:
        return this.searchApprovedExercises(input);
      case SEARCH_ROUTINES_TOOL_NAME:
        return this.searchRoutines(input);
      case GET_PROGRAM_BUILDER_LINK_TOOL_NAME:
        return this.getProgramBuilderLink(input);
      case GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME:
        return this.getProgramShareLinkOrPdf(input);
      default:
        throw new PhysioMcpToolInputError(`Unknown tool: ${toolName}`);
    }
  }
}
