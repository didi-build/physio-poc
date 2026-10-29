export type ExerciseSearchSort = "most_used" | "newest" | "a_to_z";

export type ResolvedTextField = {
  key: string;
  resolved: string;
  library_value: string;
  library_updated: boolean;
};

export type ExerciseUndoSnapshot = {
  had_row: boolean;
  favourite: boolean;
  saved_at: string | null;
  last_used_at: string | null;
  text_overrides_json: string;
  param_overrides_json: string;
};

export type ExerciseMutationUndo = {
  practitioner_id: string;
  exercise_id: string;
  snapshot: ExerciseUndoSnapshot;
};

export type ApprovedExerciseSummary = {
  exercise_id: string;
  exercise_version_id: string;
  exercise_name: string;
  category: "Stretching" | "Strengthening";
  body_regions: string[];
  allowed_prescription_types: string[];
  matched_alias: string | null;
  usage_count: number;
};

export type SearchApprovedExercisesResult = {
  exercises: ApprovedExerciseSummary[];
  next_cursor: string | null;
  search_link: string | null;
  total_count: number;
};

export type MyExerciseSection =
  "new_from_requests" | "pinned" | "recently_used_and_saved";

export type MyExerciseListItem = {
  exercise_id: string;
  exercise_version_id: string;
  exercise_name: string;
  category: "Stretching" | "Strengthening";
  section: MyExerciseSection;
  favourite: boolean;
  saved_at: string;
  last_used_at: string | null;
  edited: boolean;
  library_updated: boolean;
  library_updated_fields: string[];
  matched_alias: string | null;
  body_regions: string[];
};

export type MyExercisesListResult = {
  sections: {
    new_from_requests: MyExerciseListItem[];
    pinned: MyExerciseListItem[];
    recently_used_and_saved: MyExerciseListItem[];
  };
};

export type ExerciseDetailsResult = {
  exercise_id: string;
  exercise_version_id: string;
  version_number: number;
  category: "Stretching" | "Strengthening";
  body_regions: string[];
  aliases: string[];
  allowed_prescription_types: string[];
  usage_count: number;
  approved_at: string;
  media_set_id: string | null;
  in_my_exercises: boolean;
  favourite: boolean;
  library: {
    title: string;
    description: string;
    equipment: string;
    starting_position: string;
    steps: string;
    common_mistakes: string;
    regressions: string;
    progressions: string;
    precautions: string;
    cue_stretching: string | null;
    cue_isometric: string | null;
    cue_concentric: string | null;
    cue_eccentric: string | null;
  };
  resolved_text: ResolvedTextField[];
  param_overrides: Record<string, unknown>;
  resolved_params_by_type: Record<
    string,
    { params: Record<string, unknown>; source: string }
  >;
};
