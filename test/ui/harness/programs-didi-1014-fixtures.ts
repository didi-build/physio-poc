import type { ProgramShareConnectorView } from "../../../src/services/programs/program-publish-service.js";
import type { ProgramBuilderView } from "../../../src/services/programs/types.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";

export const PROGRAMS_1014_CODE = "PRG-6T2P";
const PROGRAM_ID = "prog-harness-1014";
const SHARE_URL = "https://physio.test.example/l/harness-open-token";
const PUBLISHED_AT = "2026-10-24T18:10:00.000Z";

function exerciseRow(
  id: string,
  position: number,
  title: string,
): ProgramBuilderView["rows"][number] {
  return {
    id,
    position,
    kind: "exercise",
    exercise_id: "ex-h1",
    exercise_version_id: "ver-h1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "stretching",
    params: { hold_s: 30 },
    params_source: "global_defaults",
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
  };
}

function placeholderRow(id: string, position: number, title: string) {
  return {
    id,
    position,
    kind: "placeholder" as const,
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-ph-1",
    pinned_version_number: null,
    prescription_type: "stretching" as const,
    params: {},
    params_source: "global_defaults" as const,
    resolved_params: {},
    resolved_params_source: "global_defaults" as const,
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
  };
}

const baseRows = [
  exerciseRow("row-h1", 0, "Heel slide"),
  exerciseRow("row-h2", 1, "Quad set"),
  exerciseRow("row-h3", 2, "Hamstring stretch"),
  exerciseRow("row-h4", 3, "Step-up"),
  exerciseRow("row-h5", 4, "Balance stand"),
];

export type Programs1014HarnessScenario =
  | "publish-first-filled"
  | "publish-first-name-required"
  | "publish-republish"
  | "publish-placeholders"
  | "builder-sticky"
  | "share-open"
  | "share-closed";

export function builderProgramFor1014(
  scenario: Programs1014HarnessScenario,
): ProgramBuilderView {
  const routineOrigin = {
    routine_id: "rt-knee",
    routine_version_id: "rv-knee-3",
    routine_name: "Knee osteoarthritis, starter",
    routine_version_number: 3,
    used_as: "tweaked" as const,
  };

  switch (scenario) {
    case "publish-first-filled":
      return {
        program_id: PROGRAM_ID,
        code: PROGRAMS_1014_CODE,
        name: "Knee osteoarthritis, starter",
        created_at: "2026-10-24T12:00:00.000Z",
        draft_updated_at: "2026-10-24T12:00:00.000Z",
        auto_save_status: { kind: "not_published_yet" },
        draft_saved_at: "2026-10-24T12:00:00.000Z",
        exercise_count: 5,
        library_updates_to_review: 0,
        rows: baseRows,
        open_share_link: false,
        share_link_status: "none",
        last_sent_at: null,
        deleted_at: null,
        routine_origin: routineOrigin,
      };
    case "publish-first-name-required":
      return {
        program_id: PROGRAM_ID,
        code: PROGRAMS_1014_CODE,
        name: "",
        created_at: "2026-10-24T12:00:00.000Z",
        draft_updated_at: "2026-10-24T12:00:00.000Z",
        auto_save_status: { kind: "not_published_yet" },
        draft_saved_at: "2026-10-24T12:00:00.000Z",
        exercise_count: 5,
        library_updates_to_review: 0,
        rows: baseRows,
        open_share_link: false,
        share_link_status: "none",
        last_sent_at: null,
        deleted_at: null,
        routine_origin: routineOrigin,
      };
    case "publish-republish":
      return {
        program_id: PROGRAM_ID,
        code: PROGRAMS_1014_CODE,
        name: "Knee osteoarthritis, starter",
        created_at: "2026-10-24T12:00:00.000Z",
        draft_updated_at: "2026-10-25T12:00:00.000Z",
        auto_save_status: { kind: "unpublished_changes" },
        draft_saved_at: "2026-10-25T12:00:00.000Z",
        exercise_count: 5,
        library_updates_to_review: 0,
        rows: baseRows,
        open_share_link: true,
        share_link_status: "open",
        last_sent_at: PUBLISHED_AT,
        deleted_at: null,
        routine_origin: routineOrigin,
      };
    case "publish-placeholders":
      return {
        program_id: PROGRAM_ID,
        code: PROGRAMS_1014_CODE,
        name: "Knee osteoarthritis, starter",
        created_at: "2026-10-24T12:00:00.000Z",
        draft_updated_at: "2026-10-24T12:00:00.000Z",
        auto_save_status: { kind: "not_published_yet" },
        draft_saved_at: "2026-10-24T12:00:00.000Z",
        exercise_count: 5,
        library_updates_to_review: 0,
        rows: [
          ...baseRows.slice(0, 4),
          placeholderRow("row-ph", 4, "Custom balance drill"),
        ],
        open_share_link: false,
        share_link_status: "none",
        last_sent_at: null,
        deleted_at: null,
        routine_origin: routineOrigin,
      };
    case "builder-sticky":
      return {
        program_id: PROGRAM_ID,
        code: PROGRAMS_1014_CODE,
        name: "Knee osteoarthritis, starter",
        created_at: "2026-10-24T12:00:00.000Z",
        draft_updated_at: "2026-10-25T12:00:00.000Z",
        auto_save_status: { kind: "unpublished_changes" },
        draft_saved_at: "2026-10-25T12:00:00.000Z",
        exercise_count: 5,
        library_updates_to_review: 0,
        rows: baseRows,
        open_share_link: true,
        share_link_status: "open",
        last_sent_at: PUBLISHED_AT,
        deleted_at: null,
        routine_origin: routineOrigin,
      };
    case "share-open":
    case "share-closed":
      return builderProgramFor1014("publish-republish");
    default: {
      const never: never = scenario;
      throw new Error(`Unknown scenario ${never}`);
    }
  }
}

export function shareViewFor1014(
  scenario: Programs1014HarnessScenario,
): ProgramShareConnectorView {
  const base: ProgramShareConnectorView = {
    display_state: "draft_only",
    share_link: "",
    share_link_status: "none",
    share_link_state: "none",
    expires_at: null,
    open_share_link: false,
    draft: { version: 2, updated_at: "2026-10-25T12:00:00.000Z" },
    published: null,
    program_code: PROGRAMS_1014_CODE,
    program_name: "Knee osteoarthritis, starter",
    link_expires_in: null,
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: null,
  };

  if (scenario === "publish-republish" || scenario === "builder-sticky") {
    return {
      ...base,
      display_state: "published_with_draft_changes",
      share_link: SHARE_URL,
      share_link_status: "open",
      share_link_state: "live",
      expires_at: "2027-06-30T23:59:59.000Z",
      open_share_link: true,
      published: { version: 1, updated_at: PUBLISHED_AT },
      link_expires_in: "1_year",
      publish_change_lines: ["Title changed", "Added Hamstring stretch"],
      published_at: PUBLISHED_AT,
    };
  }

  if (scenario === "share-open") {
    return {
      ...base,
      display_state: "published_only",
      share_link: SHARE_URL,
      share_link_status: "open",
      share_link_state: "live",
      expires_at: "2027-06-30T23:59:59.000Z",
      open_share_link: true,
      published: { version: 1, updated_at: PUBLISHED_AT },
      draft: null,
      link_expires_in: "1_year",
      published_at: PUBLISHED_AT,
    };
  }

  if (scenario === "share-closed") {
    return {
      ...base,
      display_state: "published_only",
      share_link: "https://physio.test.example/l/harness-closed-token",
      share_link_status: "closed",
      share_link_state: "closed",
      expires_at: null,
      open_share_link: false,
      published: { version: 1, updated_at: PUBLISHED_AT },
      draft: null,
      published_at: PUBLISHED_AT,
    };
  }

  return base;
}

export function programsClientFor1014Harness(
  scenario: Programs1014HarnessScenario,
): ProgramsClient {
  const program = builderProgramFor1014(scenario);
  const share = shareViewFor1014(scenario);
  return {
    getProgramByCode: async (code: string) => {
      if (code !== PROGRAMS_1014_CODE) {
        throw new Error("program_not_found");
      }
      return program;
    },
    getShareLink: async () => share,
    listPrograms: async () => ({ items: [], matched_code: null }),
    listDeletedPrograms: async () => ({ items: [] }),
    updateProgramName: async (_id: string, name: string) => ({
      program: { ...program, name },
    }),
    publishProgram: async () => ({
      program: {
        ...program,
        auto_save_status: {
          kind: "published",
          published_at: PUBLISHED_AT,
        },
      },
      share_link: SHARE_URL,
    }),
    setShareLinkExpiry: async () => share,
    closeShareLink: async () => shareViewFor1014("share-closed"),
  } as unknown as ProgramsClient;
}

export const PROGRAMS_1014_FIXTURE_ROUTES: Record<
  | "programs-1014-publish-first"
  | "programs-1014-publish-name-required"
  | "programs-1014-publish-republish"
  | "programs-1014-publish-placeholders"
  | "programs-1014-builder-sticky"
  | "programs-1014-share-open"
  | "programs-1014-share-closed",
  { initialEntry: string; scenario: Programs1014HarnessScenario }
> = {
  "programs-1014-publish-first": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/publish`,
    scenario: "publish-first-filled",
  },
  "programs-1014-publish-name-required": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/publish`,
    scenario: "publish-first-name-required",
  },
  "programs-1014-publish-republish": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/publish`,
    scenario: "publish-republish",
  },
  "programs-1014-publish-placeholders": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/publish`,
    scenario: "publish-placeholders",
  },
  "programs-1014-builder-sticky": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}`,
    scenario: "builder-sticky",
  },
  "programs-1014-share-open": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/share`,
    scenario: "share-open",
  },
  "programs-1014-share-closed": {
    initialEntry: `/programs/${PROGRAMS_1014_CODE}/share`,
    scenario: "share-closed",
  },
};
