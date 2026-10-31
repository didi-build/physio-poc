import type { ApprovedExerciseSummary } from "../exercise-library/types.js";

export type DraftInProgressSummary = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  status: "open" | "drafting";
  exercise_id: string | null;
  draft_title: string | null;
};

export type SimilarExercisesResult = {
  library_matches: ApprovedExerciseSummary[];
  drafts_in_progress: DraftInProgressSummary[];
};

export type SubmitResolution = "submit" | "use_existing" | "merge" | "submit_anyway";

export type ConflictSimilarRequest = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  requested_by: string;
  status: "open" | "drafting";
  exercise_id: string | null;
  draft_title: string | null;
  submitted_at: string;
};

export type SubmitExerciseRequestResult =
  | {
      outcome: "created";
      request_id: string;
      status: "open" | "drafting";
      exercise_id: string | null;
    }
  | {
      outcome: "conflict";
      similar_request: ConflictSimilarRequest;
      pending: {
        requested_name: string;
        exercise_note: string | null;
      };
    }
  | {
      outcome: "used_existing";
      request_id: string;
      exercise_id: string | null;
    }
  | {
      outcome: "merged";
      request_id: string;
      exercise_id: string | null;
    };

export type InProgressRequestListItem = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  status: "open" | "drafting";
  requested_by: string;
  exercise_id: string | null;
  draft_title: string | null;
  updated_at: string;
};

export type InProgressRequestsResult = {
  requests: InProgressRequestListItem[];
  in_progress_count: number;
};

export type ExerciseRequestDraftView = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  status: "open" | "drafting";
  requested_by: string;
  exercise_id: string | null;
  draft: {
    exercise_version_id: string;
    version_number: number;
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
  } | null;
};

export type ApproveExerciseRequestResult = {
  request_id: string;
  exercise_id: string;
  exercise_version_id: string;
  version_number: 1;
  approved_by: string;
  approved_at: string;
};

export type DraftFieldPatch = Partial<{
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
}>;
