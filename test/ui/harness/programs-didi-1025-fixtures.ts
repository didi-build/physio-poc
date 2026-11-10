import type { ProgramListItem } from "../../../src/services/programs/types.js";
import type { ProgramBuilderView } from "../../../src/services/programs/types.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";
import {
  builderProgramFor1014,
  programsClientFor1014Harness,
  shareViewFor1014,
} from "./programs-didi-1014-fixtures.js";

export const PROGRAMS_1025_CODE = "PRG-7K3Q";
const PROGRAM_ID = "prog-harness-1025";

export const ROUTINE_1025_ORIGIN = {
  routine_id: "rt-knee-oa",
  routine_version_id: "rv-knee-3",
  routine_name: "Knee osteoarthritis, starter",
  routine_version_number: 3,
  used_as: "tweaked" as const,
};

function rowFrom1014(program: ProgramBuilderView): ProgramBuilderView["rows"] {
  return program.rows;
}

export function builderProgramFor1025(
  scenario: "builder-from-routine" | "publish-from-routine",
): ProgramBuilderView {
  const base = builderProgramFor1014("publish-first-filled");
  return {
    ...base,
    program_id: PROGRAM_ID,
    code: PROGRAMS_1025_CODE,
    name:
      scenario === "publish-from-routine"
        ? ROUTINE_1025_ORIGIN.routine_name
        : base.name,
    routine_origin: ROUTINE_1025_ORIGIN,
    rows: rowFrom1014(base),
  };
}

const listItemsFor1025: ProgramListItem[] = [
  {
    program_id: "prog-1025-a",
    code: PROGRAMS_1025_CODE,
    name: "Knee rehab, week 1",
    exercise_count: 4,
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    library_updates_to_review: 0,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: { ...ROUTINE_1025_ORIGIN },
  },
  {
    program_id: "prog-1025-b",
    code: "PRG-9M2L",
    name: "Ankle starter",
    exercise_count: 2,
    draft_updated_at: "2026-10-22T12:00:00.000Z",
    auto_save_status: { kind: "published", published_at: "2026-10-23T12:00:00.000Z" },
    library_updates_to_review: 0,
    share_link_status: "open",
    last_sent_at: "2026-10-23T12:00:00.000Z",
    deleted_at: null,
    routine_origin: null,
  },
];

export type Programs1025HarnessScenario =
  "builder-from-routine" | "publish-from-routine" | "list-filters";

export function programsClientFor1025Harness(
  scenario: Programs1025HarnessScenario,
): ProgramsClient {
  if (scenario === "list-filters") {
    return {
      listPrograms: async () => ({
        items: listItemsFor1025,
        matched_code: null,
      }),
      listDeletedPrograms: async () => ({ items: [] }),
    } as unknown as ProgramsClient;
  }

  const program = builderProgramFor1025(scenario);
  const share = shareViewFor1014("publish-first-filled");
  const publishClient = programsClientFor1014Harness("publish-first-filled");
  return {
    ...publishClient,
    getProgramByCode: async (code: string) => {
      if (code !== PROGRAMS_1025_CODE) {
        throw new Error("program_not_found");
      }
      return program;
    },
    getShareLink: async () => ({
      ...share,
      program_code: PROGRAMS_1025_CODE,
      program_name: program.name,
    }),
  } as unknown as ProgramsClient;
}

export const PROGRAMS_1025_FIXTURE_ROUTES: Record<
  | "programs-1025-builder-from-routine"
  | "programs-1025-publish-from-routine"
  | "programs-1025-list-filters"
  | "programs-1025-new-chooser"
  | "programs-1025-pick-routine"
  | "programs-1199-pick-routine-preselected",
  {
    initialEntry: string | { pathname: string; state?: unknown };
    scenario?: Programs1025HarnessScenario;
  }
> = {
  "programs-1025-builder-from-routine": {
    initialEntry: `/programs/${PROGRAMS_1025_CODE}`,
    scenario: "builder-from-routine",
  },
  "programs-1025-publish-from-routine": {
    initialEntry: `/programs/${PROGRAMS_1025_CODE}/publish`,
    scenario: "publish-from-routine",
  },
  "programs-1025-list-filters": {
    initialEntry: "/programs",
    scenario: "list-filters",
  },
  "programs-1025-new-chooser": {
    initialEntry: "/programs/new",
  },
  "programs-1025-pick-routine": {
    initialEntry: { pathname: "/programs/new", state: { openRoutinePicker: true } },
  },
  "programs-1199-pick-routine-preselected": {
    initialEntry: `/programs/new?from_routine_id=${ROUTINE_1025_ORIGIN.routine_id}`,
  },
};
