import { categoryToLabel } from "../../domain/exercise-category-labels.js";
import {
  FreeTextValidationError,
  validateRequestNote,
  validateRequestedExerciseName,
} from "../../domain/exercise-free-text.js";
import { prescriptionTypesForCategory } from "../../domain/exercise-types.js";
import {
  generateOpaqueEntityId,
  OpaqueEntityIdValidationError,
  validateOpaqueEntityId,
} from "../../domain/opaque-entity-id.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
  PractitionerExercisesRepository,
  PractitionersRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  ExerciseRequestsReadRepository,
  type SimilarInProgressRow,
} from "../../storage/repositories/exercise-requests-read.js";
import { ExerciseLibraryReadRepository } from "../../storage/repositories/exercise-library-read.js";
import type { ApprovedExerciseSummary } from "../exercise-library/types.js";
import {
  PractitionerNotFoundError,
  requirePractitionerRecord,
} from "../practitioner-access.js";
import {
  appendMergeToDraftRequest,
  fakeExerciseDraftGenerator,
  type ExerciseDraftGenerator,
} from "./fake-draft-generator.js";
import type {
  ApproveExerciseRequestResult,
  DraftFieldPatch,
  ExerciseRequestDraftView,
  InProgressRequestsResult,
  SimilarExercisesResult,
  SubmitExerciseRequestResult,
  SubmitResolution,
} from "./types.js";

const SIMILAR_LIBRARY_LIMIT = 10;
const FORM_OPENED_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

export class ExerciseRequestsServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "request_not_found"
      | "invalid_input"
      | "draft_not_ready"
      | "conflict_target_not_found"
      | "merge_target_not_ready"
      | "approve_failed",
  ) {
    super(message);
    this.name = "ExerciseRequestsServiceError";
  }
}

function isIsoDateTimeString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return new Date(parsed).toISOString() === value;
}

function assertFormOpenedAtNotFarFuture(formOpenedAt: string, nowIso: string): void {
  const openedMs = Date.parse(formOpenedAt);
  const nowMs = Date.parse(nowIso);
  if (openedMs > nowMs + FORM_OPENED_MAX_FUTURE_SKEW_MS) {
    throw new ExerciseRequestsServiceError(
      "form_opened_at must not be far in the future",
      "invalid_input",
    );
  }
}

function mapFreeTextError(err: unknown): never {
  if (err instanceof FreeTextValidationError) {
    throw new ExerciseRequestsServiceError(err.message, "invalid_input");
  }
  if (err instanceof OpaqueEntityIdValidationError) {
    throw new ExerciseRequestsServiceError(err.message, "invalid_input");
  }
  throw err;
}

function parseOpaqueId(raw: string, fieldLabel: string): string {
  try {
    return validateOpaqueEntityId(raw, fieldLabel);
  } catch (err) {
    mapFreeTextError(err);
  }
}

type ConflictPayload = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  requested_by: string;
  status: "open" | "drafting";
  exercise_id: string | null;
  draft_title: string | null;
  submitted_at: string;
};

function mapSimilarRow(row: SimilarInProgressRow): ConflictPayload {
  return {
    request_id: row.id,
    requested_name: row.requested_name,
    exercise_note: row.note,
    requested_by: row.requested_by,
    status: row.status as "open" | "drafting",
    exercise_id: row.exercise_id,
    draft_title: row.draft_title,
    submitted_at: row.created_at,
  };
}

function mapLibraryRow(
  row: Awaited<ReturnType<ExerciseLibraryReadRepository["searchApproved"]>>[number],
): ApprovedExerciseSummary {
  const bodyRegions = row.body_region_labels
    ? row.body_region_labels.split(", ").filter(Boolean)
    : [];
  return {
    exercise_id: row.exercise_id,
    exercise_version_id: row.exercise_version_id,
    exercise_name: row.title,
    category: categoryToLabel(row.category),
    body_regions: bodyRegions,
    allowed_prescription_types: [...prescriptionTypesForCategory(row.category)],
    matched_alias: row.matched_alias,
    usage_count: row.usage_count,
  };
}

function parseSubmitText(
  requestedName: string,
  exerciseNote?: string | null,
): {
  requestedName: string;
  exerciseNote: string | null;
} {
  try {
    return {
      requestedName: validateRequestedExerciseName(requestedName),
      exerciseNote: validateRequestNote(exerciseNote),
    };
  } catch (err) {
    mapFreeTextError(err);
  }
}

export class ExerciseRequestsService {
  private readonly requests: ExerciseRequestsRepository;
  private readonly requestsRead: ExerciseRequestsReadRepository;
  private readonly libraryRead: ExerciseLibraryReadRepository;
  private readonly versions: ExerciseVersionsRepository;
  private readonly exercises: ExercisesRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly practitionerExercises: PractitionerExercisesRepository;
  private readonly draftGenerator: ExerciseDraftGenerator;
  private readonly now: () => string;

  constructor(
    private readonly sql: SqlStoragePort,
    _config: PhysioServerConfig,
    options?: {
      now?: () => string;
      draftGenerator?: ExerciseDraftGenerator;
    },
  ) {
    this.requests = new ExerciseRequestsRepository(sql);
    this.requestsRead = new ExerciseRequestsReadRepository(sql);
    this.libraryRead = new ExerciseLibraryReadRepository(sql);
    this.versions = new ExerciseVersionsRepository(sql);
    this.exercises = new ExercisesRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.practitionerExercises = new PractitionerExercisesRepository(sql);
    this.now = options?.now ?? (() => new Date().toISOString());
    this.draftGenerator = options?.draftGenerator ?? fakeExerciseDraftGenerator;
  }

  async listSimilar(input: {
    practitionerId: string;
    query: string;
  }): Promise<SimilarExercisesResult> {
    await this.requirePractitioner(input.practitionerId);
    const query = input.query.trim();
    if (!query) {
      throw new ExerciseRequestsServiceError("Query is required", "invalid_input");
    }

    const libraryRows = await this.libraryRead.searchApproved({
      query,
      sort: "a_to_z",
      limit: SIMILAR_LIBRARY_LIMIT,
      offset: 0,
    });

    const draftRows =
      await this.requestsRead.listInProgressDraftsForSimilarQuery(query);

    return {
      library_matches: libraryRows.map(mapLibraryRow),
      drafts_in_progress: draftRows.map((row) => ({
        request_id: row.id,
        requested_name: row.requested_name,
        exercise_note: row.note,
        status: row.status as "open" | "drafting",
        exercise_id: row.exercise_id,
        draft_title: row.draft_title,
      })),
    };
  }

  async submitRequest(input: {
    practitionerId: string;
    requestedName: string;
    exerciseNote?: string | null;
    formOpenedAt: string;
    resolution?: SubmitResolution;
    conflictRequestId?: string;
  }): Promise<SubmitExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    if (!isIsoDateTimeString(input.formOpenedAt)) {
      throw new ExerciseRequestsServiceError(
        "form_opened_at must be an ISO-8601 UTC timestamp",
        "invalid_input",
      );
    }
    assertFormOpenedAtNotFarFuture(input.formOpenedAt, this.now());

    const resolution = input.resolution ?? "submit";
    const { requestedName, exerciseNote } = parseSubmitText(
      input.requestedName,
      input.exerciseNote,
    );

    if (resolution === "use_existing" || resolution === "merge") {
      if (!input.conflictRequestId) {
        throw new ExerciseRequestsServiceError(
          "conflict_request_id is required for this resolution",
          "invalid_input",
        );
      }
      const conflictId = parseOpaqueId(input.conflictRequestId, "conflict_request_id");
      const target = await this.requests.findById(conflictId);
      if (!target || !["open", "drafting"].includes(target.status)) {
        throw new ExerciseRequestsServiceError(
          "Similar request not found",
          "conflict_target_not_found",
        );
      }
      if (resolution === "use_existing") {
        return {
          outcome: "used_existing",
          request_id: target.id,
          exercise_id: target.exercise_id,
        };
      }
      if (!target.exercise_id) {
        throw new ExerciseRequestsServiceError(
          "Merge target has no draft yet",
          "merge_target_not_ready",
        );
      }
      await appendMergeToDraftRequest({
        sql: this.sql,
        targetRequestId: target.id,
        mergedName: requestedName,
        mergedNote: exerciseNote,
        now: this.now(),
      });
      return {
        outcome: "merged",
        request_id: target.id,
        exercise_id: target.exercise_id,
      };
    }

    if (resolution === "submit" || resolution === "submit_anyway") {
      if (resolution === "submit") {
        const conflict = await this.requestsRead.findConflictCandidate({
          requestedBy: input.practitionerId,
          requestedName,
          formOpenedAt: input.formOpenedAt,
        });
        if (conflict) {
          return {
            outcome: "conflict",
            similar_request: mapSimilarRow(conflict),
            pending: {
              requested_name: requestedName,
              exercise_note: exerciseNote,
            },
          };
        }
      }

      const requestId = generateOpaqueEntityId();
      const timestamp = this.now();
      await this.requests.insert({
        id: requestId,
        requestedName,
        note: exerciseNote,
        requestedBy: input.practitionerId,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.draftGenerator(
        {
          sql: this.sql,
          requestId,
          requestedName,
          exerciseNote,
          requestedBy: input.practitionerId,
          now: timestamp,
        },
        {
          exercises: this.exercises,
          versions: this.versions,
          requests: this.requests,
        },
      );

      const updated = await this.requests.findById(requestId);
      return {
        outcome: "created",
        request_id: requestId,
        status: (updated?.status ?? "drafting") as "open" | "drafting",
        exercise_id: updated?.exercise_id ?? null,
      };
    }

    throw new ExerciseRequestsServiceError("Invalid resolution", "invalid_input");
  }

  async listInProgress(input: {
    practitionerId: string;
  }): Promise<InProgressRequestsResult> {
    await this.requirePractitioner(input.practitionerId);
    const rows = await this.requestsRead.listInProgress();
    const count = await this.requests.countInProgress();
    return {
      in_progress_count: count,
      requests: rows.map((row) => ({
        request_id: row.id,
        requested_name: row.requested_name,
        exercise_note: row.note,
        status: row.status as "open" | "drafting",
        requested_by: row.requested_by,
        exercise_id: row.exercise_id,
        draft_title: row.draft_title,
        updated_at: row.updated_at,
      })),
    };
  }

  async getInProgressCount(input: { practitionerId: string }): Promise<number> {
    await this.requirePractitioner(input.practitionerId);
    return this.requests.countInProgress();
  }

  async getRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<ExerciseRequestDraftView> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row || !["open", "drafting"].includes(row.status)) {
      throw new ExerciseRequestsServiceError("Request not found", "request_not_found");
    }

    let draft: ExerciseRequestDraftView["draft"] = null;
    if (row.exercise_id) {
      const versionRow = await this.versions.findDraftVersionDetailForExercise(
        row.exercise_id,
      );
      if (versionRow) {
        draft = {
          exercise_version_id: versionRow.id,
          version_number: versionRow.version_number,
          title: versionRow.title,
          description: versionRow.description,
          equipment: versionRow.equipment,
          starting_position: versionRow.starting_position,
          steps: versionRow.steps,
          common_mistakes: versionRow.common_mistakes,
          regressions: versionRow.regressions,
          progressions: versionRow.progressions,
          precautions: versionRow.precautions,
          cue_stretching: versionRow.cue_stretching,
          cue_isometric: versionRow.cue_isometric,
          cue_concentric: versionRow.cue_concentric,
          cue_eccentric: versionRow.cue_eccentric,
        };
      }
    }

    return {
      request_id: row.id,
      requested_name: row.requested_name,
      exercise_note: row.note,
      status: row.status as "open" | "drafting",
      requested_by: row.requested_by,
      exercise_id: row.exercise_id,
      draft,
    };
  }

  async updateDraft(input: {
    practitionerId: string;
    requestId: string;
    patch: DraftFieldPatch;
  }): Promise<ExerciseRequestDraftView> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row || row.status !== "drafting" || !row.exercise_id) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    const draft = await this.versions.findDraftForExercise(row.exercise_id);
    if (!draft) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }

    if (Object.keys(input.patch).length > 0) {
      try {
        const updated = await this.versions.updateDraftFields(draft.id, {
          title: input.patch.title,
          description: input.patch.description,
          equipment: input.patch.equipment,
          startingPosition: input.patch.starting_position,
          steps: input.patch.steps,
          commonMistakes: input.patch.common_mistakes,
          regressions: input.patch.regressions,
          progressions: input.patch.progressions,
          precautions: input.patch.precautions,
          cueStretching: input.patch.cue_stretching,
          cueIsometric: input.patch.cue_isometric,
          cueConcentric: input.patch.cue_concentric,
          cueEccentric: input.patch.cue_eccentric,
        });
        if (!updated) {
          throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
        }
      } catch (err) {
        mapFreeTextError(err);
      }
    }

    await this.requests.updateStatus({
      id: row.id,
      status: "drafting",
      updatedAt: this.now(),
      allowedFromStatuses: ["open", "drafting"],
    });

    return this.getRequest({ practitionerId: input.practitionerId, requestId: row.id });
  }

  async approveRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<ApproveExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row || row.status !== "drafting" || !row.exercise_id) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    const draft = await this.versions.findDraftForExercise(row.exercise_id);
    if (!draft || draft.version_number !== 1) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }

    const approvedAt = this.now();
    const approved = await this.versions.approveDraft({
      versionId: draft.id,
      approvedBy: input.practitionerId,
      approvedAt,
    });
    if (!approved) {
      throw new ExerciseRequestsServiceError("Approve failed", "approve_failed");
    }

    await this.requests.updateStatus({
      id: row.id,
      status: "approved",
      updatedAt: approvedAt,
      allowedFromStatuses: ["drafting"],
    });

    await this.practitionerExercises.upsert({
      practitionerId: row.requested_by,
      exerciseId: row.exercise_id,
      savedAt: approvedAt,
    });

    return {
      request_id: row.id,
      exercise_id: row.exercise_id,
      exercise_version_id: draft.id,
      version_number: 1,
      approved_by: input.practitionerId,
      approved_at: approvedAt,
    };
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    try {
      await requirePractitionerRecord(this.practitioners, practitionerId);
    } catch (err) {
      if (err instanceof PractitionerNotFoundError) {
        throw new ExerciseRequestsServiceError(
          "Practitioner not found",
          "practitioner_not_found",
        );
      }
      throw err;
    }
  }
}
