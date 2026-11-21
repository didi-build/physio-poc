import type { ProgramBuilderView } from "../../../src/services/programs/types.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";

export const PROGRAMS_1106_CODE = "PRG-7K3M";
const PROGRAM_ID = "prog-harness-1106";

function mismatchRow(
  id: string,
  position: number,
  title: string,
): ProgramBuilderView["rows"][number] {
  return {
    id,
    position,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-mm-harness",
    pinned_version_number: null,
    prescription_type: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    params_source: null,
    resolved_params: { hold_s: 30, sets: 3, days_per_week: 3 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: "type_mismatch",
    type_mismatch_approved_category: "strengthening",
  };
}

export type Programs1106HarnessScenario = "builder-type-mismatch";

export function builderProgramFor1106(
  scenario: Programs1106HarnessScenario,
): ProgramBuilderView {
  if (scenario !== "builder-type-mismatch") {
    throw new Error(`Unknown 1106 harness scenario: ${scenario}`);
  }
  return {
    program_id: PROGRAM_ID,
    code: PROGRAMS_1106_CODE,
    name: "Knee program",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    type_mismatch_placeholder_count: 1,
    rows: [mismatchRow("row-mm-harness", 0, "Bridge marching")],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
  };
}

export function programsClientFor1106Harness(
  scenario: Programs1106HarnessScenario,
): ProgramsClient {
  const program = builderProgramFor1106(scenario);
  return {
    listPrograms: async () => ({ items: [], matched_code: null }),
    listDeletedPrograms: async () => ({ items: [] }),
    createProgram: async () => ({ program }),
    getProgram: async () => program,
    getProgramByCode: async () => program,
    updateProgramName: async () => ({ program }),
    deleteProgram: async () => ({ program }),
    restoreProgram: async () => ({ program }),
    addExerciseRow: async () => ({ program }),
    reorderRows: async () => ({ program }),
    duplicateRow: async () => ({ program }),
    deleteRow: async () => ({ program }),
    updateRow: async () => ({ program }),
    applyLibraryUpdate: async () => ({ program }),
    keepLibraryUpdate: async () => ({ program }),
    addPlaceholderRow: async () => ({ program }),
    linkTypeMismatchPlaceholder: async () => ({ program, undo: null }),
    undoTypeMismatchPlaceholderLink: async () => ({ program }),
    publishProgram: async () => ({ program, share_link: null }),
    fetchShareView: async () => null,
    getShareLink: async () => {
      throw new Error("not used in 1106 harness");
    },
  } as unknown as ProgramsClient;
}

export const PROGRAMS_1106_FIXTURE_ROUTES: Record<
  "programs-1106-type-mismatch",
  { initialEntry: string; scenario: Programs1106HarnessScenario }
> = {
  "programs-1106-type-mismatch": {
    initialEntry: `/programs/${PROGRAMS_1106_CODE}`,
    scenario: "builder-type-mismatch",
  },
};
