import type { ApprovedExerciseSummary } from "../exercise-library/types.js";

export type DraftInProgressSummary = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  status: "open" | "drafting";
  exercise_id: string | null;
  draft_title: string | null;
  requested_by: string;
  requested_by_email: string;
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
  requested_by_email: string;
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
  requested_by_email: string;
  exercise_id: string | null;
  draft_title: string | null;
  updated_at: string;
  generation_in_progress: boolean;
};

export type InProgressRequestsResult = {
  requests: InProgressRequestListItem[];
  in_progress_count: number;
};

export type DraftGenerationFailurePhase = "text" | "images" | "daily" | null;

export type ExerciseRequestDraftGenerationMeta = {
  /** Fresh lock held by another tab or request. */
  generation_in_progress: boolean;
  /** True when draft text and both draft stills exist. */
  first_draft_complete: boolean;
  /** ISO timestamp of the active lock, when held (for UI escape timing). */
  draft_generation_locked_at?: string | null;
  /** Persisted terminal failure from the latest attempt, when idle. */
  generation_failure?: DraftGenerationFailurePhase;
  generation_failure_code?: string | null;
};

export type GenerateExerciseRequestDraftResult =
  | { outcome: "complete"; view: ExerciseRequestDraftView }
  | {
      outcome: "in_progress";
      view: ExerciseRequestDraftView;
      started_elsewhere: boolean;
    }
  | { outcome: "text_failed"; error: string; view: null }
  | { outcome: "images_failed"; view: ExerciseRequestDraftView }
  | { outcome: "daily_limit"; view: ExerciseRequestDraftView };

export type RegenerateDraftTextResult =
  | { outcome: "complete"; view: ExerciseRequestDraftView }
  | {
      outcome: "in_progress";
      view: ExerciseRequestDraftView;
      started_elsewhere: boolean;
    }
  | { outcome: "text_failed"; error: string; view: ExerciseRequestDraftView | null };

export type ExerciseRequestDraftView = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  status: "open" | "drafting";
  requested_by: string;
  requested_by_email: string;
  exercise_id: string | null;
  generation: ExerciseRequestDraftGenerationMeta;
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

export type WithdrawExerciseRequestResult = {
  request_id: string;
  status: "withdrawn";
  already_withdrawn: boolean;
};

export type ApproveExerciseRequestResult = {
  request_id: string;
  exercise_id: string;
  exercise_version_id: string;
  version_number: 1;
  approved_by: string;
  approved_at: string;
  skipped_count: number;
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
