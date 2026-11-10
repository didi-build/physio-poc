import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";

export type RoutineSearchSort = "most_used" | "newest" | "a_to_z";

export type RoutineConditionOption = {
  condition_id: string;
  label: string;
};

/** `GET /api/me/body-regions` (DIDI-1204). */
export type MeBodyRegionOption = {
  id: string;
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

/** One entry per published community version newer than the practitioner's saved baseline. */
export type RoutineCommunityChangeEntry = {
  version_number: number;
  change_summary: string | null;
};

export type RoutineCommunityChangeList =
  | {
      baseline_available: true;
      entries: RoutineCommunityChangeEntry[];
    }
  | {
      baseline_available: false;
    };

type RoutineDetailsShared = {
  routine_id: string;
  /** DIDI-1204 (required once API lands). */
  body_region_id?: string;
  body_region_label: string;
  /** DIDI-1204 (null when unset once API lands). */
  condition_id?: string | null;
  condition_label: string | null;
  who_its_for: string | null;
  sent_program_count: number;
  sent_program_codes: string[];
  conditions_available: boolean;
};

export type RoutineDetailsPublished = RoutineDetailsShared & {
  is_draft: false;
  draft: null;
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
  personal_changes: RoutinePersonalChanges | null;
  community_change_list: RoutineCommunityChangeList | null;
};

export type RoutineDetailsDraft = RoutineDetailsShared & {
  is_draft: true;
  draft: {
    routine_version_id: string;
    name: string | null;
    draft_updated_at: string;
    rows: RoutineExerciseRow[];
  };
  community: null;
  my_copy: null;
  personal_changes: null;
  community_change_list: null;
};

export type RoutineDetailsResult = RoutineDetailsPublished | RoutineDetailsDraft;

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

export type RoutineDraftUndoSnapshot = {
  routine_id: string;
  draft_version_id: string;
  created_at: string;
  draft_updated_at: string;
  body_region_id: string;
  condition_id: string | null;
  who_its_for: string | null;
  name: string | null;
  rows: RoutineUndoRowSnapshot[];
};

export type RoutineDraftDiscardUndo = {
  practitioner_id: string;
  routine_id: string;
  snapshot: RoutineDraftUndoSnapshot;
};

export type PublishValidationIssue = "missing_name" | "missing_exercises";

export type RoutineVersionHistoryItem = {
  routine_version_id: string;
  version_number: number;
  name: string;
  change_summary: string | null;
  restored_from_version_number: number | null;
  created_by: string;
  created_at: string;
  exercise_count: number;
  is_live: boolean;
  sent_program_count: number;
};

export type RoutineVersionHistoryResult = {
  routine_id: string;
  live_version_number: number;
  versions: RoutineVersionHistoryItem[];
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
