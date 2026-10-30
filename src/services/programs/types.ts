import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { ResolvedParamsSource } from "../../domain/resolve-exercise-params.js";
import type { ProgramRowTextSnapshot } from "../../domain/program-types.js";

export type ProgramAutoSaveStatus =
  | { kind: "not_published_yet" }
  | { kind: "unpublished_changes" }
  | { kind: "published"; published_at: string };

export type ProgramLibraryUpdatePrompt = {
  row_id: string;
  exercise_id: string;
  exercise_title: string;
  pinned_version_number: number;
  latest_version_number: number;
};

export type ProgramBuilderRow = {
  id: string;
  position: number;
  kind: "exercise" | "placeholder";
  exercise_id: string | null;
  exercise_version_id: string | null;
  exercise_request_id: string | null;
  pinned_version_number: number | null;
  prescription_type: PrescriptionType;
  params: ExerciseParams;
  params_source: ResolvedParamsSource | null;
  text_snapshot: ProgramRowTextSnapshot;
  note: string | null;
  library_update: ProgramLibraryUpdatePrompt | null;
};

export type ProgramRoutineOriginView = {
  routine_id: string;
  routine_version_id: string;
  routine_version_number: number;
  routine_name: string;
  used_as: "used_as_is" | "tweaked";
};

export type ProgramBuilderView = {
  program_id: string;
  code: string;
  name: string | null;
  created_at: string;
  draft_updated_at: string;
  auto_save_status: ProgramAutoSaveStatus;
  draft_saved_at: string;
  exercise_count: number;
  library_updates_to_review: number;
  rows: ProgramBuilderRow[];
  open_share_link: boolean;
  deleted_at: string | null;
  routine_origin: ProgramRoutineOriginView | null;
};

export type ProgramListItem = {
  program_id: string;
  code: string;
  name: string | null;
  exercise_count: number;
  draft_updated_at: string;
  auto_save_status: ProgramAutoSaveStatus;
  library_updates_to_review: number;
  deleted_at: string | null;
  routine_origin: ProgramRoutineOriginView | null;
};

export type ProgramSearchResult = {
  items: ProgramListItem[];
  matched_code: string | null;
};

export type ProgramMutationResult = {
  program: ProgramBuilderView;
};

export type ProgramOriginFilter = "all" | "from_routine" | "from_scratch";

export type RoutineProgramSource = "my_copy" | "community";

export type RoutineSentProgramStats = {
  sent_count: number;
  codes: string[];
};
