import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";

export type RoutineSearchSort = "most_used" | "newest" | "a_to_z";

export type RoutineConditionOption = {
  condition_id: string;
  label: string;
};

export type CommunityRoutineSummary = {
  routine_id: string;
  routine_version_id: string;
  name: string;
  version_number: number;
  body_region_label: string;
  condition_label: string | null;
  exercise_count: number;
  usage_count: number;
  added_by_you: boolean;
  in_my_routines: boolean;
};

export type SearchCommunityRoutinesResult = {
  routines: CommunityRoutineSummary[];
  next_cursor: string | null;
  search_link: string | null;
  total_count: number;
  conditions_available: boolean;
  condition_options: RoutineConditionOption[];
};

export type MyRoutineDraftItem = {
  routine_id: string;
  name: string | null;
  draft_updated_at: string;
  body_region_label: string;
  condition_label: string | null;
};

export type MyRoutineSavedItem = {
  routine_id: string;
  name: string;
  saved_copy_version: number;
  community_version: number | null;
  edited: boolean;
  saved_at: string;
  last_used_at: string | null;
  community_updated: boolean;
  body_region_label: string;
  condition_label: string | null;
  exercise_count: number;
};

export type MyRoutinesListResult = {
  drafts: MyRoutineDraftItem[];
  saved: MyRoutineSavedItem[];
  flagged_count: number;
  conditions_available: boolean;
  condition_options: RoutineConditionOption[];
};

export type RoutineExerciseRow = {
  position: number;
  exercise_id: string;
  exercise_version_id: string;
  exercise_name: string;
  prescription_type: PrescriptionType;
  params: ExerciseParams;
};

export type RoutinePersonalChanges = {
  baseline_available: boolean;
  change_count: number;
  your_change_positions: number[];
};

/** Community change bullets held until DIDI-1183; never an empty list pretending to be valid. */
export type RoutineCommunityChangeList = {
  status: "held_pending_design";
};

export type RoutineDetailsResult = {
  routine_id: string;
  body_region_label: string;
  condition_label: string | null;
  who_its_for: string | null;
  community: {
    routine_version_id: string;
    version_number: number;
    name: string;
    updated_at: string;
    created_by: string;
    usage_count: number;
    rows: RoutineExerciseRow[];
  };
  my_copy: {
    practitioner_routine_id: string;
    source_version_number: number;
    edited: boolean;
    community_updated: boolean;
    rows: RoutineExerciseRow[];
  } | null;
  sent_program_count: number;
  sent_program_codes: string[];
  conditions_available: boolean;
  personal_changes: RoutinePersonalChanges | null;
  community_change_list: RoutineCommunityChangeList | null;
};

export type RoutineUndoRowSnapshot = {
  position: number;
  exercise_id: string;
  exercise_version_id: string;
  prescription_type: PrescriptionType;
  params_json: string;
};

export type RoutineUndoCopySnapshot = {
  id: string;
  source_routine_version_id: string;
  source_version_number: number;
  saved_at: string;
  last_used_at: string | null;
  edited: number;
  rows: RoutineUndoRowSnapshot[];
};

export type RoutineUndoSnapshot = {
  had_copy: boolean;
  copy: RoutineUndoCopySnapshot | null;
};

export type RoutineMutationUndo = {
  practitioner_id: string;
  routine_id: string;
  snapshot: RoutineUndoSnapshot;
};

export type McpRoutineSearchSummary = {
  routine_id: string;
  routine_name: string;
  routine_version: number;
  exercise_count: number;
  source: "community";
};

export type SearchRoutinesMcpResult = {
  summary: string;
  share_link: "";
  manage_url: string;
  routines: McpRoutineSearchSummary[];
  next_cursor: string | null;
};
